import React from 'react';
import {
    IArticle,
    IArticleSideWidget,
    IArticleSideWidgetComponentType,
    IContentProfileV2,
    IEditor3ValueOperational,
    IExtensionActivationResult,
    IRestApiResponse,
} from 'superdesk-api';
import {gettext} from 'core/utils';
import {AuthoringWidgetHeading} from 'apps/dashboard/widget-heading';
import {AuthoringWidgetLayout} from 'apps/dashboard/widget-layout';
import {httpRequestJsonLocal} from 'core/helpers/network';
import {IMacro} from 'superdesk-interfaces/Macro';
import {groupBy} from 'lodash';
import {Button} from 'superdesk-ui-framework/react/components/Button';
import {sdApi} from 'api';
import {dispatchInternalEvent} from 'core/internal-events';
import {generatePatch} from 'core/patch';
import {ToggleBox} from 'superdesk-ui-framework/react';
import {Switch} from 'superdesk-ui-framework/react/components/Switch';
import {omitFields} from '../data-layer';
import {assertNever, nameof} from 'core/helpers/typescript-helpers';
import {EDITOR_3_FIELD_TYPE} from '../fields/editor3';
import {dispatchEditorEvent} from '../authoring-react-editor-events';
import {InteractiveMacrosDisplay} from './interactive-macros-display';
import {editorId} from '../article-widgets/find-and-replace';
import {prepareHtmlForPatching, patchHTMLonTopOfEditorState} from 'core/editor3/helpers/patch-editor-3-html';
import {EditorState} from 'draft-js';
import {OrderedMap} from 'immutable';
import {notify} from 'core/notify/notify';

// POTENTIAL-IMPROVEMENTS: don't allow replacing the same thing twice
// -> body_html: $101 (CAD 13) -> click replace again -> $101 (CAD 13) (CAD 13)

const getLabel = () => gettext('Macros widget');

interface IState {
    macros: Array<IMacro> | null;

    // not-supported when there are no groups
    displayGrouped: boolean | 'not-supported';
    currentMacro: IMacro | null;
}

interface IMacroGroup {
    initiallyOpen: boolean;
    macros: Array<IMacro>;
    groupName: string;
}

function getGroupedOrdered(macros: Array<IMacro>): Array<IMacroGroup> {
    const groupedOrdered: Array<IMacroGroup> = [];

    groupedOrdered.push({
        groupName: gettext('Quick List'),
        initiallyOpen: true,
        macros: macros.filter((m) => m.order != null),
    });
    const groupedMacros = groupBy(macros.filter((m) => m.group != null), nameof<IMacro>('group'));

    Object.keys(groupedMacros).forEach((groupName) => {
        groupedOrdered.push({
            groupName: groupName,
            initiallyOpen: false,
            macros: groupedMacros[groupName].sort((a, b) => a.label.localeCompare(b.label)),
        });
    });
    groupedOrdered.push({
        groupName: gettext('Miscellaneous'),
        initiallyOpen: false,
        macros: macros
            .filter((m) => m.group == null)
            .sort((a, b) => a.label.localeCompare(b.label)),
    });

    return groupedOrdered;
}

function getAllMacros(): Promise<IRestApiResponse<IMacro>> {
    return httpRequestJsonLocal<IRestApiResponse<IMacro>>({
        method: 'GET',
        path: '/macros',
        urlParams: {
            backend: false,
            desk: sdApi.desks.getCurrentDeskId(),
            max_results: 200,
            page: 1,
        },
    });
}

export function highlightDistinctMatches(diff: {[key: string]: string}) {
    dispatchEditorEvent('find_and_replace__find_distinct', {
        editorId,
        matches: Object.keys(diff),
        caseSensitive: false,
    });
}

export function overwriteArticle(
    currentArticle: IArticle,
    patch: Partial<IArticle>,
    profile: IContentProfileV2,
): Promise<void> {
    const patchCopy = omitFields(patch);

    patchCopy.fields_meta = {
        ...(currentArticle.fields_meta ?? {}),
        ...(patchCopy.fields_meta ?? {}),
    };

    const allFields = profile.header.merge(profile.content);

    Object.keys(patchCopy).forEach((fieldKey) => {
        const currentField = allFields.get(fieldKey);

        if (currentField != null && currentField.fieldType === EDITOR_3_FIELD_TYPE) {
            delete patchCopy.fields_meta[currentField.id];
        }
    });

    return sdApi.article.patch(
        currentArticle,
        patchCopy,
        {patchDirectlyAndOverwriteAuthoringValues: true},
    ).then(() => {
        dispatchInternalEvent('replaceAuthoringDataWithChanges', patchCopy);
    });
}

function handleKeepStyleReplaceMacro(
    article: IArticle,
    contentProfile: IContentProfileV2,
    fieldsData: OrderedMap<string, unknown>,
): IMacroProcessor {
    return {
        beforePatch: () => {
            const editor3fields = contentProfile.header.merge(contentProfile.content)
                .filter((value) => value.fieldType === 'editor3');

            editor3fields.forEach((field) => {
                const valueOperational = fieldsData.get(field.id) as IEditor3ValueOperational;

                article[field.id] = prepareHtmlForPatching(valueOperational.store.getState().editorState);
            });
            return article;
        },
        afterPatch: (resArticle: IArticle) => {
            const patch = generatePatch(article, resArticle);
            const editor3fields = contentProfile.header.merge(contentProfile.content)
                .filter((value) => value.fieldType === 'editor3' && Object.keys(patch).includes(value.id));

            editor3fields.forEach((field) => {
                const editorStateCurrent: EditorState = (fieldsData.get(field.id) as IEditor3ValueOperational)
                    .store.getState().editorState;
                const editorStateNext = patchHTMLonTopOfEditorState(editorStateCurrent, patch[field.id]);

                dispatchEditorEvent('authoring__patch_html', {
                    editorId: field.id,
                    editorState: editorStateNext,
                    html: patch[field.id],
                });
            });
        },
    };
}

function handleSimpleReplaceMacro(article: IArticle, contentProfile: IContentProfileV2): IMacroProcessor {
    return {
        beforePatch: () => {
            return article;
        },
        afterPatch: (resArticle: IArticle) => {
            const patch = generatePatch(article, resArticle);
            const isEmpty = Object.keys(patch).length < 1;

            if (!isEmpty) {
                overwriteArticle(article, patch, contentProfile);
            }
        },
    };
}

function handleUpdateEditorStateMacro(article: IArticle, contentProfile: IContentProfileV2): IMacroProcessor {
    return {
        beforePatch: () => {
            return article;
        },
        afterPatch: (resArticle: IArticle) => {
            const fields = contentProfile.header.merge(contentProfile.content)
                .filter((value) => value.fieldType === 'editor3');

            fields.forEach((field) => {
                dispatchEditorEvent('authoring__update_editor_state', {
                    editorId: field.id,
                    article: resArticle,
                });
            });
        },
    };
}

function handleNoReplaceMacro(article: IArticle): IMacroProcessor {
    return {
        beforePatch: () => {
            return article;
        },
        afterPatch: (_resArticle: IArticle) => null,
    };
}

interface IMacroProcessor {
    beforePatch(): IArticle;
    afterPatch(response: IArticle): void;
}

function getMacroProcessor(
    macro: IMacro,
    article: IArticle,
    contentProfile: IContentProfileV2,
    fieldsData: OrderedMap<string, unknown>,
): IMacroProcessor {
    if (macro.replace_type === 'simple-replace') {
        return handleSimpleReplaceMacro(article, contentProfile);
    } else if (macro.replace_type === 'keep-style-replace') {
        return handleKeepStyleReplaceMacro(article, contentProfile, fieldsData);
    } else if (macro.replace_type === 'editor_state') {
        return handleUpdateEditorStateMacro(article, contentProfile);
    } else if (macro.replace_type === 'no-replace') {
        return handleNoReplaceMacro(article);
    } else {
        assertNever(macro.replace_type);
    }
}

const MACROS_WIDGET_ID = 'macros-widget';

class MacrosWidget extends React.PureComponent<IArticleSideWidgetComponentType, IState> {
    constructor(props: IArticleSideWidgetComponentType) {
        super(props);

        this.state = this.props.initialState ?? {
            macros: null,
            displayGrouped: false,
            currentMacro: null,
        };
    }

    componentDidMount(): void {
        if (this.props.initialState != null) {
            return;
        }

        getAllMacros().then((macros) => {
            const frontendMacros = macros._items.filter((x) => x.access_type === 'frontend');
            const groupedMacros = groupBy(frontendMacros.filter((x) => x.group != null), nameof<IMacro>('group'));

            this.setState({
                macros: frontendMacros,
                displayGrouped: Object.keys(groupedMacros).length > 0,
            });
        });
    }

    runMacro(macro: IMacro): void {
        const macroProcessor: IMacroProcessor = getMacroProcessor(
            macro,
            this.props.getLatestArticle(),
            this.props.contentProfile,
            this.props.fieldsData,
        );

        httpRequestJsonLocal<IMacro>({
            method: 'POST',
            path: '/macros',
            payload: {
                macro: macro.name,
                item: macroProcessor.beforePatch(),
            },
        }).then((res) => {
            macroProcessor.afterPatch(res.item as IArticle);
        }).catch((err) => {
            if ((err._message?.length ?? 0) > 0) {
                notify.error(err._message);
            }
        });
    }

    runInteractiveMacro(macro: IMacro): void {
        httpRequestJsonLocal({
            method: 'POST',
            path: '/macros',
            payload: {
                macro: macro.name,
                item: this.props.getLatestArticle(),
            },
        }).then((res: IMacro) => {
            this.setState({currentMacro: {...res, label: macro.label}});
            highlightDistinctMatches(res.diff);
        });
    }

    render() {
        if (this.state.macros == null) {
            return null;
        }

        const RunMacroButton: React.ComponentType<{macro: IMacro}> = ({macro}) => {
            return (
                <div style={{paddingBlockStart: 4}}>
                    <Button
                        expand
                        style="hollow"
                        onClick={() => {
                            macro.action_type !== 'interactive'
                                ? this.runMacro(macro)
                                : this.runInteractiveMacro(macro);
                        }}
                        text={macro.label}
                    />
                </div>
            );
        };

        const groupedOrdered = this.state.displayGrouped !== 'not-supported'
            ? getGroupedOrdered(this.state.macros)
            : [];

        return (
            <AuthoringWidgetLayout
                header={(
                    <AuthoringWidgetHeading
                        widgetId={MACROS_WIDGET_ID}
                        widgetName={getLabel()}
                        editMode={false}
                    />
                )}
                body={(
                    Object.keys(this.state.currentMacro?.diff ?? {}).length < 1 ?
                        (
                            <>
                                {this.state.displayGrouped !== 'not-supported' && (
                                    <Switch
                                        label={{content: gettext('Group Macros')}}
                                        value={this.state.displayGrouped}
                                        onChange={() =>
                                            this.setState({displayGrouped: !this.state.displayGrouped})
                                        }
                                    />
                                )}
                                {
                                    this.state.displayGrouped ? (
                                        groupedOrdered.map((group, i) => {
                                            return (
                                                <ToggleBox
                                                    variant="simple"
                                                    key={i}
                                                    initiallyOpen={group.initiallyOpen}
                                                    title={group.groupName}
                                                >
                                                    {group.macros.map((macro) => (
                                                        <RunMacroButton
                                                            key={macro.name}
                                                            macro={macro}
                                                        />
                                                    ))}
                                                </ToggleBox>
                                            );
                                        })
                                    ) : this.state.macros.map((macro) => (
                                        <RunMacroButton
                                            key={macro.name}
                                            macro={macro}
                                        />
                                    ))
                                }
                            </>
                        ) : (
                            <InteractiveMacrosDisplay
                                onClose={() => this.setState({currentMacro: null})}
                                currentMacro={this.state.currentMacro}
                            />
                        )
                )}
            />
        );
    }
}

export function getMacrosWidget() {
    const metadataWidget: IArticleSideWidget = {
        _id: MACROS_WIDGET_ID,
        label: getLabel(),
        order: 2,
        icon: 'macro',
        component: MacrosWidget,
    };

    return metadataWidget;
}
