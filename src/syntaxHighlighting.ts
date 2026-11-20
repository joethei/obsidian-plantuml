import {lineHighlighter, StreamLanguage, StreamParser, StringStream} from "@codemirror/language";
import {Extension} from "@codemirror/state";

/**
 * Tokenizer for PlantUML source.
 *
 * It is written against the stream interface CodeMirror 5 modes and CodeMirror 6 `StreamParser`s share,
 * so the same parser highlights fenced code blocks in notes (Obsidian runs those through its CodeMirror 5 mode registry)
 * and the editor of `.puml` files.
 *
 * Token names are the classic CodeMirror ones, Obsidian renders them as `cm-<token>` classes and colours them with its
 * `--code-*` variables.
 */

export interface PlantUMLState {
    /** diagram type from the last `@start…` marker, e.g. `uml`, `mindmap`, `gantt` */
    diagram: string;
    blockComment: boolean;
    /** free text block (multi-line note, legend, …) that is open, see {@link TEXT_BLOCK_END} */
    textBlock: string;
    /** free text block that starts on the next line */
    pendingTextBlock: string;
    /** inside a label `:…;` that spans lines, of an activity or of a mindmap / wbs item */
    label: "" | "activity" | "outline";
    /** inside `<style>…</style>` */
    style: boolean;
    /** brace depth of a class-like body, its lines are members and not commands */
    members: number;
    /** brace depth of a `skinparam xyz {…}` block */
    skinparams: number;

    // reset for every line
    /** only whitespace came before, so `'` starts a comment, `!` a directive and `:` a label */
    lineStart: boolean;
    /** a colour or a mindmap bullet came before, so `:` starts a label */
    labelStart: boolean;
    /** the rest of the line is free text, keywords are not highlighted */
    prose: boolean;
    /** depth of `(…)` and `[…]`, which hold names, labels and conditions but no commands */
    nested: number;
    /** what the next word is: the name of a declared element, the target of an arrow, a skinparam, … */
    expect: "" | "name" | "typeOrName" | "target" | "property";
    /** the rest of the line is a single token with this style */
    rest: "" | "plain" | "string";
    /** this line declares a class-like element or a skinparam, a `{` on it opens a body */
    opens: "" | "members" | "skinparams";
    /** in a `<style>` block: whether this line holds selectors */
    selectors: boolean;
}

/** diagrams whose content is not PlantUML syntax */
const RAW_DIAGRAMS = new Set(["creole", "ditaa", "dot", "ebnf", "files", "latex", "math", "regex"]);
const DATA_DIAGRAMS = new Set(["json", "yaml"]);
const OUTLINE_DIAGRAMS = new Set(["mindmap", "wbs"]);

/** words that declare an element, the word that follows is its name */
const ELEMENT_TYPES = new Set([
    "action", "actor", "agent", "analog", "annotation", "archimate", "artifact", "binary", "boundary", "card",
    "circle", "class", "clock", "cloud", "collections", "component", "concise", "control", "database",
    "dataclass", "diamond", "entity", "enum", "exception", "file", "folder", "frame", "hexagon", "interface",
    "json", "label", "map", "metaclass", "namespace", "node", "object", "package", "participant", "person",
    "port", "portin", "portout", "process", "protocol", "queue", "record", "rectangle", "robust", "stack",
    "state", "stereotype", "storage", "struct", "usecase",
]);

/** element types whose `{…}` body lists members (fields, methods, values) */
const MEMBER_TYPES = new Set([
    "annotation", "class", "dataclass", "entity", "enum", "exception", "interface", "json", "map",
    "metaclass", "object", "protocol", "record", "stereotype", "struct",
]);

/** modifiers like `{static}` inside a class body */
const MODIFIERS = new Set(["abstract", "classifier", "field", "method", "static"]);

const KEYWORDS = new Set([
    ...ELEMENT_TYPES,
    "abstract", "activate", "again", "allow_mixing", "allowmixing", "also", "alt", "as", "attributes",
    "autoactivate", "autonumber", "backward", "bottom", "box", "break", "caption", "case", "center",
    "classifier", "create", "critical", "deactivate", "destroy", "detach", "direction", "down", "else",
    "elseif", "empty", "end", "endfooter", "endfork", "endheader", "endhnote", "endif", "endlegend",
    "endmerge", "endnote", "endref", "endrnote", "endsplit", "endswitch", "endtitle", "endwhile", "extends",
    "field", "fields", "footbox", "footer", "fork", "group", "header", "hide", "hnote", "if", "implements",
    "is", "kill", "left", "legend", "link", "loop", "mainframe", "members", "merge", "method", "methods",
    "newpage", "note", "of", "on", "opt", "order", "over", "par", "partition", "ref", "remove", "repeat",
    "restore", "return", "right", "rnote", "rotate", "scale", "set", "show", "side", "skin", "skinparam", "split",
    "sprite", "start", "static", "stop", "switch", "then", "title", "to", "together", "top", "unlinked",
    "up", "url", "while",
]);

const GANTT_KEYWORDS = new Set([
    "after", "and", "are", "as", "at", "before", "by", "caption", "closed", "colored", "completed", "day",
    "days", "deleted", "displays", "end", "ends", "endlegend", "footbox", "footer", "for", "friday", "from",
    "ganttscale", "happens", "header", "hide", "in", "is", "just", "language", "lasts", "legend", "links",
    "monday", "month", "monthly", "months", "names", "note", "of", "on", "open", "pauses", "printscale",
    "project", "projectscale", "quarterly", "requires", "saturday", "separator", "show", "skinparam",
    "start", "starts", "sunday", "the", "then", "thursday", "title", "to", "today", "tuesday", "until",
    "wednesday", "week", "weekly", "weeks", "with", "yearly", "zoom",
]);

const ATOMS = new Set(["true", "false"]);

/** keywords after which the rest of the line is a label, e.g. `alt successful case` */
const PROSE_KEYWORDS = new Set([
    "alt", "box", "break", "caption", "critical", "else", "footer", "group", "header", "loop", "mainframe",
    "newpage", "opt", "par", "partition", "return", "title",
]);

/** how the free text blocks are closed */
const TEXT_BLOCK_END: Record<string, RegExp> = {
    description: /^\]/,
    note: /^end\s*[hr]?note\b/i,
    ref: /^end\s*ref\b/i,
    legend: /^end\s*legend\b/i,
    title: /^end\s*title\b/i,
    header: /^end\s*header\b/i,
    footer: /^end\s*footer\b/i,
};

/** preprocessor directives whose argument is a file, url or theme */
const INCLUDE_DIRECTIVES = new Set([
    "import", "include", "include_many", "include_once", "includedef", "includesub", "includeurl", "theme",
]);

/**
 * arrows and links in all their forms: `->`, `-->>`, `<|--`, `o--`, `}|..||`, `-[#red,dashed]->`, `-up->`, …
 * groups: left head, body, style, body, right head
 */
const ARROW = /^(\|[o|]|\}[o|]|[ox]?(?:<<|<\|?)|\\\\?|\/\/?|\[|\?|[*o+#x}^])?([-.=~]+)(\[[^\]]*\])?(?:(?:up|down|left|right|do|le|ri|u|d|l|r)(?=[-.=~]))?([-.=~]*)((?:>>|\|?>)(?:[ox](?!\w))?|[o|][|{]|\\\\?|\/\/?|\]|\?|[*+#{^]|[ox](?!\w))?/i;

function startLine(state: PlantUMLState) {
    state.lineStart = true;
    state.labelStart = false;
    state.prose = false;
    state.nested = 0;
    state.expect = "";
    state.rest = "";
    state.opens = "";
    state.selectors = false;
    if (state.pendingTextBlock) {
        state.textBlock = state.pendingTextBlock;
        state.pendingTextBlock = "";
    }
}

function startDiagram(state: PlantUMLState, diagram: string) {
    state.diagram = diagram;
    state.blockComment = false;
    state.textBlock = "";
    state.pendingTextBlock = "";
    state.label = "";
    state.style = false;
    state.members = 0;
    state.skinparams = 0;
}

function blockComment(stream: StringStream, state: PlantUMLState): string {
    if (stream.skipTo("'/")) {
        stream.pos += 2;
        state.blockComment = false;
    } else {
        stream.skipToEnd();
    }
    return "comment";
}

/**
 * an activity label ends at a `;` or at one of the other shape delimiters at the end of the line,
 * the label of a mindmap or wbs item only at a `;` at the end of the line
 */
function label(stream: StringStream, state: PlantUMLState): null {
    if (state.label === "outline") {
        if (/;\s*$/.test(stream.string.slice(stream.pos))) state.label = "";
        stream.skipToEnd();
    } else if (stream.match(/^[^;]*?(;|[|<>/\\\]}]\s*$)/)) {
        state.label = "";
    } else {
        stream.skipToEnd();
    }
    return null;
}

/** a use case actor `:User:`, as long as no text follows, which makes it an activity label with a colon */
function actor(stream: StringStream): boolean {
    const match = stream.match(/^:[^\s:;][^:;]*:(?!:)/, false) as RegExpMatchArray | null;
    if (!match || !/^(\s*$|\s+as\b|\s*(<<|#|[-.=<]))/i.test(stream.string.slice(stream.pos + match[0].length))) return false;
    stream.pos += match[0].length;
    return true;
}

/** a string, json strings can contain escaped quotes */
function quoted(stream: StringStream, escapes = false): string {
    stream.next();
    for (let ch = stream.next(); ch !== undefined && ch !== '"'; ch = stream.next()) {
        if (escapes && ch === "\\") stream.next();
    }
    return "string";
}

function arrow(stream: StringStream): boolean {
    const match = stream.match(ARROW, false) as RegExpMatchArray | null;
    if (!match) return false;
    const [all, left, body, , body2, right] = match;
    // `o` and `x` heads alone don't make an arrow, `x-ray` is a word
    const symbolHead = (head: string | undefined) => head !== undefined && !/^[ox]$/i.test(head);
    // neither does a single `-` or `=`, unless it stands on its own, so dates and hyphenated words stay text
    const standalone = stream.pos > stream.lineStart && /\s/.test(stream.string.charAt(stream.pos - 1))
        && /^(\s|$)/.test(stream.string.slice(stream.pos + all.length));
    if (body.length + body2.length < 2 && !symbolHead(left) && !symbolHead(right) && !standalone) return false;
    stream.pos += all.length;
    return true;
}

function word(stream: StringStream, state: PlantUMLState, atLineStart: boolean): string | null {
    const word = stream.current().toLowerCase();
    const expect = state.expect;
    state.expect = "";

    if (expect === "property") return "property";
    if (expect === "target") return null;
    if (state.members > 0) return state.members > 1 && MODIFIERS.has(word) ? "keyword" : null;
    if (state.skinparams > 0 && atLineStart) {
        state.prose = true;
        return "property";
    }
    if (ATOMS.has(word)) return "atom";
    if (state.prose || state.nested > 0) return null;
    if (expect === "name" || (expect === "typeOrName" && !ELEMENT_TYPES.has(word))) return "def";

    const keywords = state.diagram === "gantt" ? GANTT_KEYWORDS : KEYWORDS;
    if (!keywords.has(word)) return null;

    const rest = stream.string.slice(stream.pos);
    const before = stream.string.slice(stream.lineStart, stream.start);
    // an element named like a keyword: `End --> Foo`, `Node "1" *-- Leaf`, `Database : field`
    if (/^\s*("[^"]*"\s*)?([-.=~>*}|\\/]|<(?!<)|[ox][-.=<])/i.test(rest)) return null;
    if (ELEMENT_TYPES.has(word) && /^\s*:(\s|$)/.test(rest)) return null;
    // types declare an element at the start of a line, after `abstract` or after commands like `hide`
    if (ELEMENT_TYPES.has(word) && expect !== "typeOrName" && !/^\s*((create|hide|show|remove|restore)\s+)?$/i.test(before)) return null;
    // free text blocks are opened by their keyword at the start of the line, at most after an alignment;
    // `end note` or an element named `Note` doesn't open one
    const command = /^\s*((left|right|center|top|bottom)\s+)*$/i.test(before);
    // a colon that isn't part of `Foo::bar` makes it a single line note
    const singleLine = /(^|[^:]):(?!:)/.test(rest);
    if (word === "abstract") {
        state.expect = "typeOrName";
        state.opens = "members";
    } else if (ELEMENT_TYPES.has(word)) {
        state.expect = "name";
        if (MEMBER_TYPES.has(word)) state.opens = "members";
    } else if (word === "as") {
        state.expect = "name";
    } else if (word === "skinparam") {
        state.expect = "property";
        state.opens = "skinparams";
    } else if (command && (word === "note" || word === "hnote" || word === "rnote")) {
        if (!singleLine && !/^\s*"/.test(rest)) state.pendingTextBlock = "note";
    } else if (command && word === "ref") {
        if (!singleLine) state.pendingTextBlock = "ref";
    } else if (command && word === "legend") {
        state.pendingTextBlock = "legend";
    }

    if (command && (word === "title" || word === "header" || word === "footer") && /^(\s*(left|right|center|top|bottom))*\s*$/i.test(rest)) {
        state.pendingTextBlock = word;
    } else if (PROSE_KEYWORDS.has(word)) {
        state.prose = true;
    }
    return "keyword";
}

/** json and yaml diagrams */
function data(stream: StringStream, atLineStart: boolean): string | null {
    if (stream.peek() === '"') {
        quoted(stream, true);
        return stream.match(/^\s*:/, false) ? "property" : "string";
    }
    if (atLineStart && stream.match(/^#highlight\b/)) return "keyword";
    if (stream.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?\b/)) return "number";
    if (stream.match(/^[\w-]+(?=\s*:(\s|$))/)) return "property";
    if (stream.match(/^\w+/)) return ATOMS.has(stream.current()) || stream.current() === "null" ? "atom" : null;
    stream.next();
    return null;
}

/** `<style>` blocks, a CSS like syntax */
function style(stream: StringStream, state: PlantUMLState, atLineStart: boolean): string | null {
    if (atLineStart) state.selectors = /\{/.test(stream.string.slice(stream.pos));
    if (stream.match(/^<\/style>/i)) {
        state.style = false;
        return "tag";
    }
    if (stream.peek() === '"') return quoted(stream);
    if (stream.match(/^#\w+/)) return "atom";
    if (stream.match(/^\d+(\.\d+)?/)) return "number";
    if (stream.match(/^<<[^<>]+>>/)) return "attribute";
    if (stream.match(/^\.?[A-Za-z_][\w-]*/)) {
        if (state.selectors) return "tag";
        if (atLineStart || state.expect === "property") {
            state.expect = "";
            return "property";
        }
        return ATOMS.has(stream.current().toLowerCase()) ? "atom" : null;
    }
    // after `{` or `;` comes a property: `.h { BackgroundColor red; FontSize 12 }`
    const ch = stream.next();
    if (ch === "{" || ch === ";") {
        state.selectors = false;
        state.expect = "property";
    }
    return null;
}

function diagram(stream: StringStream, state: PlantUMLState, atLineStart: boolean): string | null {
    const atLabelStart = atLineStart || state.labelStart;
    state.labelStart = false;
    if (atLineStart) {
        // mindmap and wbs items: the bullet, then free text
        if (OUTLINE_DIAGRAMS.has(state.diagram) && stream.match(/^(\*+|\++|-+)[_<>]?(?=[\s:[]|$)/)) {
            state.labelStart = true;
            state.prose = true;
            return "keyword";
        }
        // the colour of an activity: `#pink:label;`
        if (state.members === 0 && stream.match(/^#\w+(?=:)/)) {
            state.labelStart = true;
            return "atom";
        }
    }

    const ch = stream.peek();
    if (ch === ":") {
        state.expect = "";
        if (actor(stream)) return "def";
        if (atLabelStart) {
            // a label that may span lines
            stream.next();
            state.label = OUTLINE_DIAGRAMS.has(state.diagram) ? "outline" : "activity";
            return label(stream, state);
        }
        if (!stream.match("::")) {
            // the text of a message, a note or a member type
            stream.skipToEnd();
        }
        return null;
    }
    if (ch === '"') {
        // the target of an arrow can come after its multiplicity: `A --> "*" B`
        if (state.expect !== "target") state.expect = "";
        return quoted(stream);
    }
    if (stream.match(/^\[\[[^\]]*\]\]/)) return "link";
    if (stream.match(/^<<[^<>]+>>/)) return "attribute";
    if (arrow(stream)) {
        state.expect = "target";
        // an activity arrow `-> label;`
        if (atLineStart) state.prose = true;
        return "operator";
    }
    // a `#` starting a member is its visibility (protected), not a colour
    if (!(atLineStart && state.members > 0) && stream.match(/^#\w+/)) return "atom";
    if (stream.match(/^\$\w+/)) return "variable-2";
    if (stream.match(/^%\w+/)) return "builtin";
    if (stream.match(/^@\w+/)) return "meta";
    if (stream.match(/^\d+(\.\d+)?/)) return "number";
    if (stream.match(/^[A-Za-z_]\w*/)) return word(stream, state, atLineStart);

    stream.next();
    // a description on the following lines, closed by a `]` at the start of a line
    if (ch === "[" && /^\s*$/.test(stream.string.slice(stream.pos))) state.pendingTextBlock = "description";
    if (ch === "(" || ch === "[") {
        state.nested++;
    } else if (ch === ")" || ch === "]") {
        state.nested = Math.max(0, state.nested - 1);
    } else if (ch === "{") {
        if (state.members > 0) state.members++;
        else if (state.opens === "members") state.members = 1;
        else if (state.skinparams > 0 || state.opens === "skinparams") state.skinparams++;
    } else if (ch === "}") {
        if (state.members > 0) state.members--;
        else if (state.skinparams > 0) state.skinparams--;
    }
    return null;
}

/** creates the tokenizer, a new object per call since CodeMirror 5 stores the mode name on it */
export function plantumlMode(): StreamParser<PlantUMLState> & {lineComment: string; blockCommentStart: string; blockCommentEnd: string} {
    return {
        name: "plantuml",
        lineComment: "'",
        blockCommentStart: "/'",
        blockCommentEnd: "'/",
        languageData: {
            commentTokens: {line: "'", block: {open: "/'", close: "'/"}},
        },

        startState(): PlantUMLState {
            const state = {} as PlantUMLState;
            startDiagram(state, "uml");
            startLine(state);
            return state;
        },

        token(stream: StringStream, state: PlantUMLState): string | null {
            if (stream.sol()) startLine(state);
            if (state.blockComment) return blockComment(stream, state);
            if (stream.eatSpace()) return null;

            const atLineStart = state.lineStart;
            state.lineStart = false;

            // diagram markers, also a way out of anything left open
            if (atLineStart) {
                const start = stream.match(/^@start(\w+)/i) as RegExpMatchArray | null;
                if (start) {
                    startDiagram(state, start[1].toLowerCase());
                    state.rest = "plain";
                    return "tag";
                }
                if (stream.match(/^@end\w*/i)) {
                    startDiagram(state, "uml");
                    state.rest = "plain";
                    return "tag";
                }
            }
            if (state.rest) {
                stream.skipToEnd();
                return state.rest === "string" ? "string" : null;
            }
            if (RAW_DIAGRAMS.has(state.diagram)) {
                stream.skipToEnd();
                return null;
            }

            if (stream.match("/'")) {
                state.blockComment = true;
                return blockComment(stream, state);
            }
            if (atLineStart && stream.peek() === "'") {
                stream.skipToEnd();
                return "comment";
            }

            if (state.textBlock) {
                if (atLineStart && stream.match(TEXT_BLOCK_END[state.textBlock])) {
                    const style = state.textBlock === "description" ? null : "keyword";
                    state.textBlock = "";
                    return style;
                }
                stream.skipToEnd();
                return null;
            }
            if (state.label) return label(stream, state);

            if (atLineStart && stream.eat("!")) {
                const directive = stream.match(/^\w+/) as RegExpMatchArray | null;
                if (directive && INCLUDE_DIRECTIVES.has(directive[0].toLowerCase())) state.rest = "string";
                return "meta";
            }
            if (atLineStart && stream.match(/^<style>/i)) {
                state.style = true;
                return "tag";
            }
            if (state.style) return style(stream, state, atLineStart);
            if (DATA_DIAGRAMS.has(state.diagram)) return data(stream, atLineStart);
            return diagram(stream, state, atLineStart);
        },
    };
}

/** language for the CodeMirror 6 editor of `.puml` files, shared since every language defined stays registered */
export const plantumlLanguage: Extension = [StreamLanguage.define(plantumlMode()), lineHighlighter];

/** the CodeMirror 5 mode registry Obsidian highlights fenced code blocks with */
export interface CodeMirrorModes {
    defineMode(name: string, factory: () => unknown): void;
    modes: Record<string, unknown>;
}

/**
 * highlights fenced code blocks of the given languages in the markdown editor.
 * Languages that already have a mode, e.g. from another plugin, are left alone.
 *
 * @returns a function that removes the modes again
 */
export function registerCodeBlockHighlighting(codeMirror: CodeMirrorModes | undefined, languages: string[]): () => void {
    if (!codeMirror) return () => undefined;
    const registered = languages.filter(language => !(language in codeMirror.modes));
    for (const language of registered) {
        codeMirror.defineMode(language, plantumlMode);
    }
    return () => {
        for (const language of registered) {
            // unless another plugin replaced it in the meantime
            if (codeMirror.modes[language] === plantumlMode) delete codeMirror.modes[language];
        }
    };
}
