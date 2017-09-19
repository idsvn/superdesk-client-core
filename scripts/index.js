
import 'app.scss'; // styles
import 'superdesk-ui-framework/dist/superdesk-ui-framework.min.css';
import 'vendor';
import 'core';
import 'templates-cache.generated'; // generated by grunt 'ngtemplates' task
import 'apps';

/* globals __SUPERDESK_CONFIG__: true */
const appConfig = __SUPERDESK_CONFIG__;

// alias for file generated by ngtemplates:gen-apps
import externalApps from 'external-apps';

if (appConfig.features.useTansaProofing) {
    // see: http://www.hiddenwebgenius.com/blog/guides/understanding-javascripts-asynchronous-code/
    setTimeout(require('apps/tansa'), 0);
}

let body = angular.element('body');

body.ready(() => {
    // update config via config.js
    if (window.superdeskConfig) {
        angular.merge(appConfig, window.superdeskConfig);
    }

    // non-mock app configuration must live here to allow tests to override
    // since tests do not import this file.
    angular.module('superdesk.config').constant('config', appConfig);

    /**
     * @ngdoc module
     * @name superdesk-client
     * @packageName superdesk-client
     * @description The root superdesk module.
     */
    angular.bootstrap(body, [
        'superdesk.config',
        'superdesk.core',
        'superdesk.apps'
    ].concat(externalApps), {strictDi: true});

    window.superdeskIsReady = true;
});
