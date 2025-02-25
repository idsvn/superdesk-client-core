import _, {flatMap} from 'lodash';
import {extensions} from 'appConfig';
import {IArticle, IExtensionActivationResult} from 'superdesk-api';
import {sdApi} from 'api';
import {ILanguage} from 'superdesk-interfaces/Language';
import {openArticle} from 'core/get-superdesk-api-implementation';

/**
 * @ngdoc service
 * @module superdesk.apps.translations
 * @name TranslationService
 *
 * @requires api
 * @requires notify
 * @requires authoringWorkspace
 * @requires https://docs.angularjs.org/api/ng/service/$rootScope $rootScope
 *
 * @description Provides set of methods to translate items to different languages
 */

TranslationService.$inject = ['api', '$rootScope', 'search'];
export function TranslationService(
    api,
    $rootScope,
    search,
) {
    var service: any = {};

    /**
     * @ngdoc method
     * @name TranslationService#fetch
     * @public
     * @returns {Object} Languages
     * @description Fetch languages from database
     */
    service.fetch = function() {
        return api.query('languages');
    };

    /**
     * @ngdoc method
     * @name TranslationService#get
     * @public
     * @description Return list of langugages
     * @return {Object} list of items
     */
    service.get = function() {
        return service.languages;
    };

    /**
     * @ngdoc method
     * @name TranslationService#get
     * @public
     * @description Create copy of item with new language set
     * @param {Object} item item to be translated
     * @param {Object} language translate language
     */
    service.set = function(item: IArticle, language: ILanguage) {
        sdApi.article.translate(item, language.language).then((_item) => {
            const onTranslateAfterMiddlewares
                    : Array<IExtensionActivationResult['contributions']['entities']['article']['onTranslateAfter']>
                = flatMap(
                    Object.values(extensions).map(({activationResult}) => activationResult),
                    (activationResult) => activationResult?.contributions?.entities?.article?.onTranslateAfter ?? [],
                );

            if (onTranslateAfterMiddlewares.length > 0) {
                onTranslateAfterMiddlewares.forEach((fn) => {
                    fn(item, _item);
                });
            } else {
                return openArticle(_item._id, 'edit');
            }

            $rootScope.$broadcast('item:translate');
        });
    };

    service.translationsEnabled = function() {
        return typeof service.languages === 'object'
            && Array.isArray(service.languages._items)
            && service.languages._items.length > 0;
    };

    service.getTranslations = function(item) {
        if (item.translation_id == null) {
            return Promise.reject('translation_id is not present');
        }

        var query = search.query({});

        query.filter({term: {translation_id: item.translation_id}});

        var criteria = query.getCriteria(true);

        criteria.repo = 'archive,published';

        return api.query('search', criteria);
    };

    /**
     * @ngdoc method
     * @name TranslationService#checkAvailability
     * @public
     * @description Check if item is available for translating
     * @return {boolean}
     */
    service.checkAvailability = function(item) {
        return service.translationsEnabled() ?
            _.find(service.languages._items, (language) => language.source && language.language === item.language)
            : false;
    };

    // Fetch languages from database on service initialization
    service.init = () => service.fetch().then((languages) => {
        service.languages = languages;
    });

    return service;
}
