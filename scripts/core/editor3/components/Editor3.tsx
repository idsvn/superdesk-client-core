import React from 'react';
import {connect} from 'react-redux';

import {Editor3Component} from './Editor3Component';
import {MultipleHighlights} from './MultipleHighlights';
import * as actions from '../actions';
import {EditorState} from 'draft-js';
import {Editor3InitializeSpellchecker} from './Editor3InitializeSpellchecker';

export class Editor3Base extends React.Component<any, any> {
    static defaultProps: any;

    componentDidCatch(error: Error) {
        if (error.message.includes('Node.removeChild')) {
            this.forceUpdate();
        }
    }

    render() {
        return (
            <Editor3InitializeSpellchecker spellchecking={this.props.spellchecking} dispatch={this.props.dispatch}>
                <MultipleHighlights {...this.props}>
                    <Editor3Component />
                </MultipleHighlights>
            </Editor3InitializeSpellchecker>
        );
    }
}

const mapStateToProps = (state) => ({
    readOnly: state.readOnly,
    showToolbar: state.showToolbar,
    editorState: state.editorState,
    locked: state.locked,
    editorFormat: state.editorFormat,
    tabindex: state.tabindex,
    suggestingMode: state.suggestingMode,
    spellchecking: state.spellchecking,
    invisibles: state.invisibles,
    svc: state.svc,
    loading: state.loading,
    limitBehavior: state.limitConfig?.ui,
    limit: state.limitConfig?.chars,
});

const mapDispatchToProps = (dispatch, ownProps) => ({
    onChange: (editorState: EditorState) => dispatch(actions.changeEditorState(editorState)),
    onTab: (e) => dispatch(actions.handleEditorTab(e)),
    showPopup: (type, data) => dispatch(actions.showPopup(type, data)),
    dragDrop: (transfer, mediaType) => dispatch(actions.dragDrop(
        transfer,
        mediaType,
        null,
        ownProps.canAddArticleEmbed,
    )),
    unlock: () => dispatch(actions.setLocked(false)),
    dispatch: (x) => dispatch(x),
    onCreateAddSuggestion: (chars) => dispatch(actions.createAddSuggestion(chars)),
    onCreateDeleteSuggestion: (action) => dispatch(actions.createDeleteSuggestion(action)),
    onPasteFromSuggestingMode: (content) => dispatch(actions.onPasteFromSuggestingMode(content)),
    onCreateSplitParagraphSuggestion: () => dispatch(actions.createSplitParagraphSuggestion()),
    onCreateChangeStyleSuggestion: (type, active) => dispatch(actions.createChangeStyleSuggestion(type, active)),
});

export const Editor3 = connect(mapStateToProps, mapDispatchToProps)(Editor3Base);
