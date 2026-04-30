import {debounce, Debouncer, Keymap, MarkdownPostProcessorContext, setIcon, TextFileView, ViewStateResult, WorkspaceLeaf} from "obsidian";
import PlantumlPlugin from "./main";
import {
    drawSelection,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
    lineNumbers
} from "@codemirror/view";
import {Annotation, EditorState, Extension, Transaction} from "@codemirror/state";
import {highlightSelectionMatches, search} from "@codemirror/search";
import {defaultKeymap, history, indentWithTab} from "@codemirror/commands";

export const VIEW_TYPE = "plantuml";

const views: EditorView[] = [];

const syncAnnotation = Annotation.define<boolean>();

function syncDispatch(from: number) {
    return (tr: Transaction) => {
        views[from].update([tr]);
        if (tr.changes && tr.annotation && !tr.changes.empty && !tr.annotation(syncAnnotation)) {
            for (let i = 0; i < views.length; i++) {
                if(i !== from) {
                    views[i].dispatch({
                        changes: tr.changes,
                        annotations: syncAnnotation.of(true)
                    })
                }
            }

        }

    }
}

interface VaultWithConfig {
    getConfig(key: string): unknown;
}

export class PumlView extends TextFileView {
    editor: EditorView;
    previewEl: HTMLElement;
    sourceEl: HTMLElement;
    changeModeButton: HTMLElement;
    currentView: 'source' | 'preview';
    plugin: PlantumlPlugin;
    dispatchId = -1;
    debounced: Debouncer<[string, HTMLElement, MarkdownPostProcessorContext | null], void>;

    extensions: Extension[] = [
        highlightActiveLine(),
        highlightActiveLineGutter(),
        highlightSelectionMatches(),
        drawSelection(),
        keymap.of([...defaultKeymap, indentWithTab]),
        history(),
        search(),
        EditorView.updateListener.of(v => {
            if(v.docChanged) {
                this.requestSave();
                void this.renderPreview();
            }
        })
    ]

    constructor(leaf: WorkspaceLeaf, plugin: PlantumlPlugin) {
        super(leaf);
        this.plugin = plugin;

        this.debounced = debounce(this.plugin.getProcessor().png, this.plugin.settings.debounce * 1000, true);

        this.sourceEl = this.contentEl.createDiv({cls: 'plantuml-source-view', attr: {'style': 'display: block'}});
        this.previewEl = this.contentEl.createDiv({cls: 'plantuml-preview-view', attr: {'style': 'display: none'}});

        const vault = this.app.vault as unknown as VaultWithConfig;

        if (vault.getConfig("showLineNumber")) {
            this.extensions.push(lineNumbers());
        }
        if(vault.getConfig("lineWrap")) {
            this.extensions.push(EditorView.lineWrapping);
        }

        this.editor = new EditorView({
            state: EditorState.create({
                extensions: this.extensions,
                doc: this.data,
            }),
            parent: this.sourceEl,
            dispatch: syncDispatch(views.length),
        });
        this.dispatchId = views.push(this.editor) - 1;

    }

    getViewType(): string {
        return VIEW_TYPE;
    }

    getState(): unknown {
        return super.getState();
    }

    setState(state: unknown, result: ViewStateResult): Promise<void> {
        // switch to preview mode
        if (state.mode === 'preview') {
            this.currentView = 'preview';
            setIcon(this.changeModeButton, 'pencil');
            this.changeModeButton.setAttribute('aria-label', 'Edit (Ctrl+Click to edit in new pane)');

            this.previewEl.show();
            this.sourceEl.hide();
            void this.renderPreview();
        }
        // switch to source mode
        else {
            this.currentView = 'source';
            setIcon(this.changeModeButton, 'lines-of-text');
            this.changeModeButton.setAttribute('aria-label', 'Preview (Ctrl+Click to open in new pane)');

            this.previewEl.hide();
            this.sourceEl.show();
        }

        return super.setState(state, result);
    }

    onload(): void {
        void this._onload();
    }

    private async _onload(): Promise<void> {
        // add the action to switch between source and preview mode
        this.changeModeButton = this.addAction('lines-of-text', 'Preview (Ctrl+Click to open in new pane)', (evt) => this.switchMode(evt), 17);

        // undocumented: Get the current default view mode to switch to
        const vault = this.app.vault as unknown as VaultWithConfig;
        const defaultViewMode = vault.getConfig('defaultViewMode') as 'source' | 'preview';
        this.currentView = defaultViewMode;
        await this.setState({...this.getState(), mode: defaultViewMode}, {});
    }

    onunload() {
        views.remove(views[this.dispatchId]);
        this.editor.destroy();
    }

    // function to switch between source and preview mode
    async switchMode(arg: 'source' | 'preview' | MouseEvent) {
        let mode = arg;
        // if force mode not provided, switch to opposite of current mode
        if (!mode || mode instanceof MouseEvent) mode = this.currentView === 'source' ? 'preview' : 'source';

        if (arg instanceof MouseEvent) {
            if (Keymap.isModEvent(arg)) {
                const newLeaf = this.app.workspace.getLeaf('tab');
                const currentState = this.getState();
                void newLeaf.setViewState({
                    type: VIEW_TYPE,
                    state: {
                        ...(typeof currentState === 'object' && currentState !== null ? currentState : {}),
                        mode: mode
                    }
                });
            } else {
                const currentState = this.getState();
                await this.setState({
                    ...(typeof currentState === 'object' && currentState !== null ? currentState : {}),
                    mode: mode
                }, {} as ViewStateResult);
            }
        }
    }

    // get the data for save
    getViewData() : string {
        return this.editor.state.sliceDoc();
    }

    // load the data into the view
    setViewData(data: string, clear: boolean): void {
        this.data = data;
         if (clear) {
             this.editor.setState(EditorState.create({
                 doc: data,
                 extensions: this.extensions
             }));

         }else {
             this.editor.dispatch({
                 changes: {
                     from: 0,
                     to: this.editor.state.doc.length,
                     insert: data,
                 }
             });
         }
        // if we're in preview view, also render that
        if (this.currentView === 'preview') void this.renderPreview();
    }

    // clear the editor, etc
    clear() {
        this.previewEl.empty();
        this.data = null;
    }

    getDisplayText() {
        if (this.file) return this.file.basename;
        else return "PlantUML (no file)";
    }

    canAcceptExtension(extension: string) {
        return extension == 'puml';
    }

    getIcon() {
        return "document-plantuml";
    }


    async renderPreview() {
        if(this.currentView !== "preview") return;
        this.previewEl.empty();
        const loadingHeader = this.previewEl.createEl("h1", {text: "Loading"});
        const previewDiv = this.previewEl.createDiv();


        this.debounced(this.getViewData(), previewDiv, null);
        loadingHeader.remove();
    }
}
