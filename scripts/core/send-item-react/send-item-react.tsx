import React from 'react';
import {assertNever} from 'core/helpers/typescript-helpers';
import {SendToTab} from './send-to-tab';
import {IArticle} from 'superdesk-api';
import {TabList} from 'core/ui/components/tabs';
import {Button} from 'superdesk-ui-framework';
import {gettext} from 'core/utils';
import {Panel} from './panel/panel-main';
import {PanelHeader} from './panel/panel-header';

type ITab = 'send to' | 'publish';

interface IProps {
    items: Array<IArticle>;
    closeSendToView(): void;
}

interface IState {
    tabs: Array<ITab>;
    activeTab: ITab;
}

export class SendItemReact extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            tabs: ['publish', 'send to'],
            activeTab: 'publish',
        };
    }
    render() {
        const {activeTab} = this.state;

        return (
            <Panel>
                <PanelHeader>
                    <div className="space-between" style={{width: '100%', paddingLeft: 10, paddingRight: 10}}>
                        <TabList
                            tabs={[{label: 'send to'}, {label: 'publish'}]}
                            selected={this.state.activeTab}
                            onChange={(tab: ITab) => {
                                this.setState({activeTab: tab});
                            }}
                        />

                        <Button
                            text={gettext('Close')}
                            onClick={() => {
                                this.props.closeSendToView();
                            }}
                            iconOnly
                            icon="close-small"
                            size="small"
                            shape="round"
                            style="hollow"
                        />
                    </div>
                </PanelHeader>

                {(() => {
                    if (activeTab === 'publish') {
                        return (
                            <div>publish tab</div>
                        );
                    } else if (activeTab === 'send to') {
                        return (
                            <SendToTab
                                items={this.props.items}
                                closeSendToView={this.props.closeSendToView}
                            />
                        );
                    } else {
                        return assertNever(activeTab);
                    }
                })()}
            </Panel>
        );
    }
}
