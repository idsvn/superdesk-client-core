import * as constant from '../constants';
import {get, omit, isEmpty, zipObject} from 'lodash';
import {gettext} from 'core/utils';
import {isMediaEditable} from 'core/config';
import {authoringReactViewEnabled} from 'appConfig';
import {dataApi} from 'core/helpers/CrudManager';
import {IVocabulary, IContentProfile} from 'superdesk-api';
import {IArticle, IContentProfileEditorConfig} from 'superdesk-api';
import {IPackagesService} from 'types/Services/Packages';
import {sdApi} from 'api';

/**
 * @ngdoc service
 * @module superdesk.apps.content
 * @name content
 *
 * @requires api
 * @requires superdesk
 * @requires templates
 * @requires desks
 * @requires packages
 * @requires archiveService
 * @requires notify
 * @requires $filter
 * @requires $q
 * @requires $rootScope
 * @requires session
 *
 * @description Content Service is responsible for creating packages or content items based
 * on templates or content types.
 * Also it is responsable for managing content types.
 */
ContentService.$inject = [
    'api',
    'templates',
    'desks',
    'packages',
    'archiveService',
    'notify',
    '$filter',
    '$q',
    '$rootScope',
    'session',
    'renditions',
];
export function ContentService(api, templates, desks, packages: IPackagesService, archiveService, notify,
    $filter, $q, $rootScope, session, renditions) {
    const TEXT_TYPE = 'text';

    const self = this;

    function newItem(type, initializeAsUpdated: boolean) {
        return {
            type: type || TEXT_TYPE,
            version: initializeAsUpdated ? 1 : 0,
        };
    }

    /**
     * Save data to content api
     *
     * @param {Object} data
     * @return {Promise}
     */
    function save(data) {
        return api.save('archive', data).catch((reason) => {
            if (reason.status === 403) {
                if (get(reason, 'data.error.readonly')) {
                    notify.error(gettext('You are not allowed to create article on readonly stage.'));
                } else {
                    notify.error(gettext('You are not allowed to create an article there.'));
                }
            }

            return $q.reject(reason);
        });
    }

    /**
     * Create an item of given type
     *
     * @param {string} type
     * @return {Promise}
     */
    this.createItem = function(type, initializeAsUpdated) {
        var item = newItem(type, initializeAsUpdated);

        archiveService.addTaskToArticle(item);
        return save(item);
    };

    /**
     * Create a package containing given item
     *
     * @param {Object} item
     * @return {Promise}
     */
    this.createPackageFromItems = function(item) {
        return packages.createPackageFromItems([item]);
    };

    /**
     * Create new item using given template
     *
     * @param {Object} template
     *
     * @param initializeAsUpdated
     * If an item is created, but closed without changes, it gets removed
     * it doesn't work well when creating item and adding as related immediately
     * user might want to go back and update the item later.
     * To avoid the item getting removed it is initialized with a higher version
     *
     * @return {Promise}
     */
    this.createItemFromTemplate = function(template, initializeAsUpdated) {
        var item: Partial<IArticle> = newItem(template.data.type || null, initializeAsUpdated);

        angular.extend(item, templates.pickItemData(template.data || {}), {template: template._id});
        // set the dateline date to default utc date.
        if (item.dateline && item.dateline.located) {
            item.dateline = omit(item.dateline, 'text');
            item.dateline.date = $filter('formatDateTimeString')();
        }
        // set missing byline from user profile.
        if (!item.byline) {
            item.byline = session.identity.byline;
        }

        archiveService.addTaskToArticle(item);

        return dataApi.create('archive', item).then((_item) => {
            templates.addRecentTemplate(desks.activeDeskId, template._id);
            return _item;
        });
    };

    /**
     * Creates a new content profile.
     *
     * @param {Object} data
     * @return {Promise}
     */
    this.createProfile = function(data) {
        return api.save('content_types', data);
    };

    /**
     * Creates a new content profile.
     *
     * @param {Object} item
     * @param {Object} updates
     * @return {Promise}
     */
    this.updateProfile = function(item, updates) {
        return api.update('content_types', item, updates);
    };

    /**
     * Creates a new content profile.
     *
     * @param {Object} item
     * @return {Promise}
     */
    this.removeProfile = function(item) {
        return api.remove(item, {}, 'content_types');
    };

    /**
     * Get content types from server
     *
     * @param {Boolean} includeDisabled
     * @return {Promise}
     */
    this.getTypes = function(type?: IContentProfile['type'] | null, includeDisabled?) {
        var params: {where?: any} = {};

        if (!includeDisabled) {
            params = {where: {enabled: true}};
        }

        if (type != null) {
            params.where = params.where ?? {};

            params.where.type = type;
        }

        return api.getAll('content_types', params, !!includeDisabled)
            .then((result) => result.sort((a, b) => b.priority - a.priority));
    };

    /**
     * Get types lookup
     *
     * @return {Promise}
     */
    this.getTypesLookup = function() {
        return this.getTypes(null, true).then((profiles) => {
            var lookup = {};

            profiles.forEach((profile) => {
                lookup[profile._id] = profile;
            });

            return lookup;
        });
    };

    /**
     * Get content type by id
     *
     * @param {string} id
     * @return {Promise}
     */
    this.getType = function(id) {
        return getCustomFields()
            .then(() => api.find('content_types', id));
    };

    /**
     * Get content type with metadata by id
     *
     * @param {string} id
     * @return {Promise}
     */
    this.getTypeMetadata = function(id) {
        return getCustomFields()
            .then(() => api.find('content_types', id, {edit: true}));
    };

    /**
     * Get schema for given profile/content type
     *
     * @param {Object} profile
     * @param {String} contentType
     * @return {Object}
     */
    this.schema = function(profile: IContentProfile, contentType) {
        return angular.extend({}, profile.schema);
    };

    /**
     * Get editor config for given profile/ content type
     *
     * @param {Object} profile
     * @param {String} contentType
     * @return {Object}
     */
    this.editor = function(profile: IContentProfile, contentType) {
        return angular.extend({}, profile.editor);
    };

    /**
     * Get custom fields enabled in given profile
     *
     * @param {Object} profile
     * @return {Array}
     */
    this.fields = (profile) => {
        const editor = profile.editor || {};

        return this._fields ? this._fields.filter((field) => !!editor[field._id]) : [];
    };

    /**
     * Get fields with preview enabled
     */
    this.previewFields = (editor: IContentProfileEditorConfig, fields: Array<IVocabulary>): Array<IVocabulary> =>
        editor == null || fields == null ? []
            : fields.filter((field) => editor[field._id] != null && editor[field._id].preview);

    /**
     * Get profiles selected for given desk
     *
     * @param {Object} desk
     * @param {string} profileId if profileId is set add such profile to the list
     * @return {Promise}
     */
    this.getDeskProfiles = function(desk, profileId) {
        return this.getTypes('text').then((profiles) => !desk || isEmpty(desk.content_profiles) ?
            profiles :
            profiles.filter((profile) => desk.content_profiles[profile._id] || profile._id === profileId),
        );
    };

    this.contentProfileSchema = angular.extend({}, constant.EXTRA_SCHEMA_FIELDS);
    this.contentProfileEditor = angular.extend({}, constant.EXTRA_EDITOR_FIELDS);

    $rootScope.$on('vocabularies:updated', resetFields);

    /**
     * Fetch custom fields
     *
     * this is called before getting type info so it's ready for use
     */
    function getCustomFields() {
        if (self._fields) {
            return $q.when(self._fields);
        }

        if (!self._fieldsPromise) {
            self._fieldsPromise = api.getAll('vocabularies', {
                where: {
                    $or: [
                        {field_type: {$in: constant.CUSTOM_FIELD_TYPES}},
                        {service: {$exists: true}},
                    ],
                },
            })
                .then((response) => {
                    self._fields = response;
                    self._fieldsPromise = null;
                    return self._fields;
                });
        }

        return self._fieldsPromise;
    }

    this.getCustomFields = getCustomFields;

    this.fetchAssociations = (item) => {
        const associations = item.associations || {};
        const keys = Object.keys(associations);

        return Promise.all(keys.map((key) => {
            // there is only _id, maybe _type for related items
            if (associations[key] && Object.keys(associations[key]).length <= 3) {
                return api.find('archive', associations[key]._id);
            }

            return Promise.resolve(associations[key]);
        })).then((values) => zipObject(keys, values));
    };

    /**
     * Reset custom fields info
     */
    function resetFields() {
        self._fields = null;
        self._fieldsPromise = null;
    }

    /**
     * Handle drop event transfer data and convert it to an item
     */
    this.dropItem = (item: IArticle, {fetchExternal} = {fetchExternal: true}) => {
        if (item._type !== 'externalsource') {
            if (item._type === 'ingest') {
                return sdApi.article.fetchItemsToCurrentDesk([item]).then((res) => res[0]);
            }

            if (item.archive_item != null) {
                return $q.when(item.archive_item);
            }

            return api.find(item._type, item._id);
        } else if (isMediaEditable(item) && fetchExternal) {
            return renditions.ingest(item);
        }
        return $q.when(item);
    };

    /**
     * Setup authoring scope for item
     */
    this.setupAuthoring = (profileId, scope, item: IArticle) => {
        if (item.type === 'composite') {
            return Promise.resolve({editor: {}, schema: {}, fields: []});
        } else {
            if (profileId == null) {
                throw new Error('profile ID must be provided');
            }

            return this.getType(profileId).then((profile) => {
                scope.schema = this.schema(profile, item.type);
                scope.editor = this.editor(profile, item.type);
                scope.fields = this.fields(profile);

                if (authoringReactViewEnabled !== true) {
                    const authoringAngularEditor3Fields = new Set([
                        'headline',
                        'abstract',
                        'body_html',
                        'description_text',
                        'body_footer',

                        /**
                         * slugline is not included in the list, because while it would use editor3
                         * when configured to be placed in "content" section of a content profile
                         * it would not use editor3 when configured to be placed in header section.
                         */
                    ]);

                    /**
                     * SDESK-7025
                     * The purpose of this code is to avoid editor initializing with old values for text fields
                     * after switching between authoring-angular and authoring-react.
                     * It might happen because when initializing authoring-react always
                     * prioritizes data in fields_meta over plain text value.
                     * There are fields that use editor3 in authoring-react not in authoring-angular.
                     * TAG: AUTHORING-ANGULAR
                     */
                    for (const metaFieldId of Object.keys(item.fields_meta ?? {})) {
                        const keepFieldMeta =
                            metaFieldId.startsWith('extra>') || authoringAngularEditor3Fields.has(metaFieldId);

                        if (!keepFieldMeta) {
                            delete item.fields_meta[metaFieldId];
                        }
                    }
                }

                /**
                 * order is used for tabindex in angular based authoring
                 * since every field has a tabindex there
                 * tab order breaks when tabindex is zero
                 * because zero means DOM order
                 *
                 * order is incremented by one for every field here
                 * to prevent tabindex being zero for one element
                 *
                 * this would no longer be needed in react based authoring because tabindex is not used there
                 *
                 * TAG: AUTHORING-ANGULAR
                 */
                for (const key of Object.keys(scope.editor)) {
                    if (scope.editor[key]?.order != null) {
                        scope.editor[key].order++;
                    }
                }

                return profile;
            });
        }
    };
}
