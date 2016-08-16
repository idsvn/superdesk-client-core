
'use strict';

describe('authoring widgets', function() {

    beforeEach(window.module('superdesk.templates-cache'));

    angular.module('superdesk.authoring.widgets.test', ['superdesk.authoring.widgets'])
        .config(function(authoringWidgetsProvider) {
            authoringWidgetsProvider.widget('test', {});
        });

    beforeEach(window.module('superdesk.authoring.widgets.test'));

    it('can register authoring widgets', inject(function(authoringWidgets) {
        expect(authoringWidgets.length).toBe(1);
    }));
});
