import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions';
import {StickElementsWithTracking} from 'core/helpers/dom/stickElementsWithTracking';
import {
    ISpellcheckWarning,
    ISpellchecker,
    ISpellcheckerSuggestion,
} from './interfaces';
import {gettext} from 'core/utils';
import {dispatchInternalEvent} from 'core/internal-events';
import {IReplaceWordData} from 'core/editor3/reducers/spellchecker';

export type IAcceptSuggestion = 'store-based' | ((replaceWordData: IReplaceWordData) => void);

interface IProps {
    warning: ISpellcheckWarning;
    targetElement: any;
    spellchecker: ISpellchecker;
    dispatch: any;
    acceptSuggestion: IAcceptSuggestion;
}

export class SpellcheckerContextMenuComponent extends React.Component<IProps> {
    stickyElementTracker: any;
    dropdownElement: any;

    private reloadSpellcheckerAbortController: AbortController;

    constructor(props: IProps) {
        super(props);

        this.reloadSpellcheckerAbortController = new AbortController();
    }

    componentDidMount() {
        this.stickyElementTracker = new StickElementsWithTracking(this.props.targetElement, this.dropdownElement);
    }
    componentWillUnmount() {
        this.stickyElementTracker.destroy();
        this.reloadSpellcheckerAbortController.abort();
    }

    onSuggestionClick(suggestion: ISpellcheckerSuggestion) {
        const replaceWordData: IReplaceWordData = {
            word: {
                text: this.props.warning.text,
                offset: this.props.warning.startOffset,
            },
            newWord: suggestion.text,
        };

        if (this.props.acceptSuggestion === 'store-based') {
            this.props.dispatch(
                actions.replaceWord(replaceWordData),
            );
        } else {
            this.props.acceptSuggestion(replaceWordData);
        }
    }

    render() {
        const {suggestions, message} = this.props.warning;
        const {spellchecker} = this.props;

        // If the message exists, and suggestion is whitespace suggestion
        // use message as the button text instead of the suggestion
        const messageExists = Boolean(message);
        const whitespaceSuggestionExists = suggestions.filter(
            (suggestion) => suggestion.text.trim().length === 0).length > 0;

        return (
            <div
                className={'dropdown open suggestions-dropdown'}
                ref={(el) => this.dropdownElement = el}
                style={{zIndex: 999, border: 'solid transparent', borderWidth: '6px 0'}}
                data-test-id="spellchecker-menu"
            >
                <ul className={'dropdown__menu'} style={{position: 'static'}}>
                    {messageExists && !whitespaceSuggestionExists && (
                        <React.Fragment>
                            <li style={{margin: '0 16px'}}>{message}</li>
                            <li className="dropdown__menu-divider" />
                        </React.Fragment>
                    )}
                    <div className="form-label" style={{margin: '0 16px'}}>{gettext('Suggestions')}</div>
                    {
                        suggestions.length === 0
                            ? <li><button>{gettext('SORRY, NO SUGGESTIONS.')}</button></li>
                            : suggestions.map((suggestion, index) => (
                                <li key={index}>
                                    <button
                                        onMouseDown={() =>
                                            this.onSuggestionClick(suggestion)
                                        }
                                        data-test-id="spellchecker-menu--suggestion"
                                    >
                                        {suggestion.text.trim().length === 0 && messageExists
                                            ? message : suggestion.text}
                                    </button>
                                </li>
                            ),
                            )
                    }
                    {
                        Object.keys(spellchecker.actions).length < 1 ? null : (
                            <div>
                                <li className="divider" />
                                <div className="form-label" style={{margin: '0 16px'}}>{gettext('Actions')}</div>
                                {
                                    Object.keys(spellchecker.actions).map((key, i) => {
                                        const action = spellchecker.actions[key];

                                        return (
                                            <li key={i}>
                                                <button
                                                    onMouseDown={() => {
                                                        action.perform(this.props.warning).then(() => {
                                                            dispatchInternalEvent(
                                                                'editor3SpellcheckerActionWasExecuted',
                                                                null,
                                                            );
                                                        });
                                                    }}
                                                    data-test-id="spellchecker-menu--action"
                                                >
                                                    {action.label}
                                                </button>
                                            </li>
                                        );
                                    })
                                }
                            </div>
                        )
                    }
                </ul>
            </div>
        );
    }
}

export const SpellcheckerContextMenu = connect()(SpellcheckerContextMenuComponent);
