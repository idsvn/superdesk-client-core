import React from 'react';
import * as Layout from 'superdesk-ui-framework/react/components/Layouts';
import {authoringReactViewEnabled} from 'appConfig';

export class PanelFooter extends React.PureComponent {
    render() {
        if (authoringReactViewEnabled) {
            return (
                <Layout.PanelFooter>
                    {this.props.children}
                </Layout.PanelFooter>
            );
        } else {
            return (
                <div className="side-panel__footer side-panel__footer--button-box-large">
                    {this.props.children}
                </div>
            );
        }
    }
}
