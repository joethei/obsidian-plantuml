import {debounce} from "obsidian";
import {EditorView, Decoration, DecorationSet, ViewUpdate, ViewPlugin, WidgetType} from "@codemirror/view";
import {StateField, StateEffect, StateEffectType} from "@codemirror/state";
import {Range} from "@codemirror/rangeset";
import {syntaxTree, tokenClassNodeProp} from "@codemirror/language";
import PlantumlPlugin from "../main";
import {SyntaxNodeRef} from "@lezer/common";

//based on: https://gist.github.com/nothingislost/faa89aa723254883d37f45fd16162337

interface TokenSpec {
    from: number;
    to: number;
    value: string;
}

const statefulDecorations = defineStatefulDecoration();

class StatefulDecorationSet {
    editor: EditorView;
    decoCache: { [cls: string]: Decoration } = Object.create(null);
    plugin: PlantumlPlugin;

    constructor(editor: EditorView, plugin: PlantumlPlugin) {
        this.editor = editor;
        this.plugin = plugin;
    }

    async computeAsyncDecorations(tokens: TokenSpec[]): Promise<DecorationSet | null> {
        const decorations: Range<Decoration>[] = [];
        for (const token of tokens) {
            let deco = this.decoCache[token.value];
            if (!deco) {
                const file = this.plugin.app.metadataCache.getFirstLinkpathDest(token.value, "");
                if(!file) return;
                const fileContent = await this.plugin.app.vault.read(file);
                const div = createDiv();
                if(this.plugin.settings.defaultProcessor === "png") {
                    await this.plugin.getProcessor().png(fileContent, div, null);
                }else {
                    await this.plugin.getProcessor().svg(fileContent, div, null);
                }
                deco = this.decoCache[token.value] = Decoration.replace({widget: new EmojiWidget(div), block: true});
            }
            decorations.push(deco.range(token.from, token.from));
        }
        return Decoration.set(decorations, true);
    }

    debouncedUpdate = debounce(this.updateAsyncDecorations, 100, true);

    async updateAsyncDecorations(tokens: TokenSpec[]): Promise<void> {
        const decorations = await this.computeAsyncDecorations(tokens);
        // if our compute function returned nothing and the state field still has decorations, clear them out
        if (decorations || this.editor.state.field(statefulDecorations.field).size) {
            this.editor.dispatch({effects: statefulDecorations.update.of(decorations || Decoration.none)});
        }
    }
}

function buildViewPlugin(plugin: PlantumlPlugin) {
    return ViewPlugin.fromClass(
        class {
            decoManager: StatefulDecorationSet;

            constructor(view: EditorView) {
                this.decoManager = new StatefulDecorationSet(view, plugin);
                this.buildAsyncDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.buildAsyncDecorations(update.view);
                }
            }

            buildAsyncDecorations(view: EditorView) {
                const targetElements: TokenSpec[] = [];
                for (const {from} of view.visibleRanges) {
                    const tree = syntaxTree(view.state);
                    tree.iterate({
                        enter: (node: SyntaxNodeRef) => {
                            const tokenProps = node.type.prop<string>(tokenClassNodeProp);
                            if (tokenProps) {
                                const props = new Set(tokenProps.split(" "));
                                const isEmbed = props.has("formatting-embed");
                                if (isEmbed) {
                                    const content = view.state.doc.sliceString(from);
                                    const index = content.indexOf("]]");
                                    const filename = content.slice(3, index).split("|")[0];
                                    if (filename.endsWith(".puml") || filename.endsWith(".pu")) {
                                        targetElements.push({from: from, to: index, value: filename});
                                    }
                                }
                            }
                        },
                    });
                }
                this.decoManager.debouncedUpdate(targetElements);
            }
        }
    );
}

export function asyncDecoBuilderExt(plugin: PlantumlPlugin) {
    return [statefulDecorations.field, buildViewPlugin(plugin)];
}

////////////////
// Utility Code
////////////////

// Generic helper for creating pairs of editor state fields and
// effects to model imperatively updated decorations.
// source: https://github.com/ChromeDevTools/devtools-frontend/blob/8f098d33cda3dd94b53e9506cd3883d0dccc339e/front_end/panels/sources/DebuggerPlugin.ts#L1722
function defineStatefulDecoration(): {
    update: StateEffectType<DecorationSet>;
    field: StateField<DecorationSet>;
} {
    const update = StateEffect.define<DecorationSet>();
    const field = StateField.define<DecorationSet>({
        create(): DecorationSet {
            return Decoration.none;
        },
        update(deco, tr): DecorationSet {
            return tr.effects.reduce((deco, effect) => (effect.is(update) ? effect.value : deco), deco.map(tr.changes));
        },
        provide: field => EditorView.decorations.from(field),
    });
    return {update, field};
}

class EmojiWidget extends WidgetType {
    private readonly source: HTMLDivElement;

    constructor(source: HTMLDivElement) {
        super();
        this.source = source;
    }

    eq(other: EmojiWidget) {
        return other == this;
    }

    toDOM() {
        return this.source;
    }

    ignoreEvent(): boolean {
        return false;
    }
}
