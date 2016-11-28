import * as helpers from 'apps/authoring/authoring/helpers';
import _ from 'lodash';

AuthoringDirective.$inject = [
    'superdesk',
    'superdeskFlags',
    'authoringWorkspace',
    'notify',
    'gettext',
    'desks',
    'authoring',
    'api',
    'session',
    'lock',
    'privileges',
    'content',
    '$location',
    'referrer',
    'macros',
    '$timeout',
    '$q',
    'modal',
    'archiveService',
    'confirm',
    'reloadService',
    '$rootScope',
    '$interpolate',
    'metadata',
    'suggest'
];
export function AuthoringDirective(superdesk, superdeskFlags, authoringWorkspace, notify,
    gettext, desks, authoring, api, session, lock, privileges, content, $location,
    referrer, macros, $timeout, $q, modal, archiveService, confirm, reloadService,
    $rootScope, $interpolate, metadata, suggest) {
    return {
        link: function($scope, elem, attrs) {
            var _closing;
            var tryPublish = false;
            var onlyTansaProof = true;
            var continueAfterPublish = false;
            var isCheckedByTansa = false;

            const UNIQUE_NAME_ERROR = gettext('Error: Unique Name is not unique.');

            $scope.privileges = privileges.privileges;
            $scope.dirty = false;
            $scope.views = {send: false};
            $scope.stage = null;
            $scope._editable = !!$scope.origItem._editable;
            $scope.isMediaType = _.includes(['audio', 'video', 'picture', 'graphic'], $scope.origItem.type);
            $scope.action = $scope.action || ($scope._editable ? 'edit' : 'view');
            $scope.itemActions = authoring.itemActions($scope.origItem);
            $scope.highlight = !!$scope.origItem.highlight;
            $scope.showExportButton = $scope.highlight && $scope.origItem.type === 'composite';
            $scope.openSuggestions = () => suggest.setActive();

            $scope.$watch('origItem', function(newValue, oldValue) {
                $scope.itemActions = null;
                if (newValue) {
                    $scope.itemActions = authoring.itemActions(newValue);
                }
            }, true);

            $scope.$watch('item.flags', function(newValue, oldValue) {
                if (newValue !== oldValue) {
                    $scope.item.flags = _.clone($scope.origItem.flags);
                    $scope.item.flags = newValue;
                    $scope.origItem.flags = oldValue;
                    $scope.dirty = true;
                }
            }, true);

            $scope._isInProductionStates = !authoring.isPublished($scope.origItem);

            $scope.fullPreview = false;
            $scope.fullPreviewUrl = '/#/preview/' + $scope.origItem._id;
            $scope.proofread = false;
            $scope.referrerUrl = referrer.getReferrerUrl();

            /**
             * Get the Desk and Stage for the item.
             */
            function getDeskStage() {
                if ($scope.origItem.task && $scope.origItem.task.stage) {
                    if (archiveService.isLegal($scope.origItem)) {
                        $scope.deskName = $scope.origItem.task.desk;
                        $scope.stage = $scope.origItem.task.stage;
                    } else {
                        api('stages').getById($scope.origItem.task.stage)
                            .then(function(result) {
                                $scope.stage = result;
                            });

                        desks.fetchDeskById($scope.origItem.task.desk).then(function(desk) {
                            $scope.deskName = desk.name;
                        });
                    }
                }
            }

            getDeskStage();
            /**
             * `desk_stage:change` event from send and publish action.
             * If send action succeeds but publish fails then we need change item location.
             */
            $scope.$on('desk_stage:change', getDeskStage);

            /**
             * Start editing current item
             */
            $scope.edit = function edit() {
                if (archiveService.isPublished($scope.origItem)) {
                    authoringWorkspace.view($scope.origItem);
                } else {
                    authoringWorkspace.edit($scope.origItem);
                }
            };

            /**
             * Create a new version
             */
            $scope.save = function() {
                return authoring.save($scope.origItem, $scope.item).then(function(res) {
                    $scope.dirty = false;

                    if (res.cropData) {
                        $scope.item.hasCrops = true;
                    }

                    if (res.highlight) {
                        _previewHighlight(res._id);
                    }

                    notify.success(gettext('Item updated.'));

                    return $scope.origItem;
                }, function(response) {
                    if (angular.isDefined(response.data._issues)) {
                        if (angular.isDefined(response.data._issues.unique_name) &&
                            response.data._issues.unique_name.unique === 1) {
                            notify.error(UNIQUE_NAME_ERROR);
                        } else if (angular.isDefined(response.data._issues['validator exception'])) {
                            notify.error(gettext('Error: ' + response.data._issues['validator exception']));
                        }
                    } else if (response.status === 412) {
                        notifyPreconditionFailed();
                    } else {
                        notify.error(gettext('Error. Item not updated.'));
                    }
                });
            };

            $scope.openFullPreview = function($event) {
                if ($event.button === 0 && !$event.ctrlKey) {
                    $event.preventDefault();
                    $scope.fullPreview = true;
                }
            };

            $scope.closeFullPreview = function() {
                $scope.fullPreview = false;
            };

            /**
             * Export the list of highlights as a text item.
             */
            $scope.exportHighlight = function(item) {
                if ($scope.save_enabled()) {
                    modal.confirm(gettext('You have unsaved changes, do you want to continue?'))
                        .then(function() {
                            _exportHighlight(item._id);
                        }
                    );
                } else {
                    _exportHighlight(item._id);
                }
            };

            $scope.canSaveTemplate = function() {
                return privileges.userHasPrivileges({content_templates: 1});
            };

            function _exportHighlight(_id) {
                api.generate_highlights.save({}, {package: _id})
                .then(authoringWorkspace.edit, function(response) {
                    if (response.status === 403) {
                        _forceExportHighlight(_id);
                    } else {
                        notify.error(gettext('Error creating highlight.'));
                    }
                });
            }

            function _forceExportHighlight(_id) {
                modal.confirm(gettext('There are items locked or not published. Do you want to continue?'))
                    .then(function() {
                        api.generate_highlights.save({}, {package: _id, export: true})
                        .then(authoringWorkspace.edit, function(response) {
                            notify.error(gettext('Error creating highlight.'));
                        });
                    });
            }

            function _previewHighlight(_id) {
                api.generate_highlights.save({}, {package: _id, preview: true})
                .then(function(response) {
                    $scope.highlight_preview = response.body_html;
                }, function(data) {
                    $scope.highlight_preview = data.message;
                });
            }

            if ($scope.origItem.highlight) {
                _previewHighlight($scope.origItem._id);
            }

            /**
             * Invoked by validatePublishScheduleAndEmbargo() to validate the date and time values.
             *
             * @return {string} if the values are invalid then returns appropriate error message.
             *         Otherwise empty string.
             */
            function validateTimestamp(datePartOfTS, timePartOfTS, timestamp, timezone, fieldName) {
                var errors = authoring.validateSchedule(
                    datePartOfTS,
                    timePartOfTS,
                    timestamp,
                    timezone,
                    fieldName
                );

                if (!errors) {
                    return;
                }

                function fieldErr(err) {
                    return $interpolate(err)({field: fieldName});
                }

                if (errors.date) {
                    return fieldErr(gettext('{{ field }} date is required!'));
                }

                if (errors.time) {
                    return fieldErr(gettext('{{ field }} time is required!'));
                }

                if (errors.timestamp) {
                    return fieldErr(gettext('{{ field }} is not a valid date!'));
                }

                if (errors.future && fieldName !== 'Embargo' || $scope._isInProductionStates) {
                    return fieldErr(gettext('{{ field }} cannot be earlier than now!'));
                }
            }

            /**
             * Validates the Embargo Date and Time and Publish Schedule Date and Time if they are set on the item.
             *
             * @return {boolean} true if valid, false otherwise.
             */
            function validatePublishScheduleAndEmbargo(item) {
                if (item.embargo && item.publish_schedule) {
                    notify.error(gettext('An Item can\'t have both Embargo and Publish Schedule.'));
                    return false;
                }

                var errorMessage;
                if (item.embargo_date || item.embargo_time) {
                    errorMessage = validateTimestamp(
                        item.embargo_date, item.embargo_time, item.embargo,
                        item.schedule_settings ? item.schedule_settings.time_zone : null,
                        gettext('Embargo'));
                    if (errorMessage) {
                        notify.error(errorMessage);
                        return false;
                    }
                }

                if (item.publish_schedule_date || item.publish_schedule_time) {
                    if (_.includes(['published', 'killed', 'corrected'], item.state)) {
                        return true;
                    }

                    errorMessage = validateTimestamp(
                        item.publish_schedule_date, item.publish_schedule_time,
                        item.publish_schedule, item.schedule_settings ? item.schedule_settings.time_zone : null,
                        gettext('Publish Schedule'));
                    if (errorMessage) {
                        notify.error(errorMessage);
                        return false;
                    }
                }

                return true;
            }

            function publishItem(orig, item) {
                var action = $scope.action === 'edit' ? 'publish' : $scope.action;
                validate(orig, item);

                return authoring.publish(orig, item, action)
                .then(function(response) {
                    if (!response) {
                        notify.error(gettext('Unknown Error: Item not published.'));
                        return false;
                    }

                    if (angular.isDefined(response.data) && angular.isDefined(response.data._issues)) {
                        let issues = response.data._issues;
                        if (angular.isDefined(issues['validator exception'])) {
                            var errors = issues['validator exception'];
                            var modifiedErrors = errors.replace(/\[/g, '').replace(/\]/g, '').split(',');
                            for (var i = 0; i < modifiedErrors.length; i++) {
                                notify.error(_.trim(modifiedErrors[i]));
                            }

                            if (errors.indexOf('9007') >= 0 || errors.indexOf('9009') >= 0) {
                                authoring.open(item._id, true).then(function(res) {
                                    $scope.origItem = res;
                                    $scope.dirty = false;
                                    $scope.item = _.create($scope.origItem);
                                });
                            }

                            return false;
                        }

                        if (issues.unique_name && issues.unique_name.unique) {
                            notify.error(UNIQUE_NAME_ERROR);
                            return false;
                        }
                    } else if (response.status === 412) {
                        notifyPreconditionFailed();
                        return false;
                    }

                    notify.success(gettext('Item published.'));
                    $scope.item = response;
                    $scope.dirty = false;
                    authoringWorkspace.close(true);
                    return true;
                });
            }

            function validate(orig, item) {
                let updated = _.cloneDeep(orig);
                $scope.error = {};
                tryPublish = true;
                helpers.extendItem(updated, item);
                angular.forEach(authoring.editor, function(editor, key) {
                    if (!authoring.schema[key]) {
                        var found = false;
                        var cv = _.find(metadata.cvs, function(item) {
                            return item._id === key;
                        });

                        if (cv) {
                            var field = cv.schema_field || 'subject';
                            angular.forEach(cv.items, function(row) {
                                var element = _.find(updated[field], function(item) {
                                    return item.qcode === row.qcode;
                                });
                                if (element) {
                                    found = true;
                                }
                            });
                        }

                        $scope.error[key] = !found;
                    } else {
                        var value = updated[key];
                        if (value) {
                            if (typeof value === 'object' && hasNullValue(value)) {
                                $scope.error[key] = true;
                            } else {
                                $scope.error[key] = false;
                            }
                        } else {
                            $scope.error[key] = true;
                        }
                    }
                });
            }

            function hasNullValue(target) {
                for (var member in target) {
                    if (_.isNil(target[member])) {
                        return true;
                    }
                }

                return target.length === 0;
            }

            function notifyPreconditionFailed() {
                notify.error(gettext('Item has changed since it was opened. ' +
                    'Please close and reopen the item to continue. ' +
                    'Regrettably, your changes cannot be saved.'));
                $scope._editable = false;
                $scope.dirty = false;
            }

            function validateForPublish(item) {
                var requiredFields = $rootScope.config.requiredMediaMetadata;
                if (item.type === 'picture' || item.type === 'graphic') {
                    // required media metadata fields are defined in superdesk.config.js
                    _.each(requiredFields, function(key) {
                        if (_.isNil(item[key]) || _.isEmpty(item[key])) {
                            notify.error($interpolate(gettext(
                                'Required field {{ key }} is missing. ...'))({key: key}));
                            return false;
                        }
                    });
                }
                return true;
            }

            $scope.useTansaProofing = function() {
                return $rootScope.config.features && $rootScope.config.features.useTansaProofing;
            };

            var deregisterTansa = $rootScope.$on('tansa:end', afterTansa);

            $scope.runTansa = function() {
                onlyTansaProof = true;

                switch ($scope.item.language) {
                case 'nb-NO':
                    window.tansa.settings.profileId = 1;
                    break;
                case 'nn-NO':
                    window.tansa.settings.profileId = 2;
                    break;
                }
                if (window.RunTansaProofing) {
                    window.RunTansaProofing();
                } else {
                    isCheckedByTansa = true;
                    notify.error(gettext('Tansa is not responding. You can continue editing or publish the story.'));
                }
            };

            function afterTansa(e, isCancelled) {
                if (onlyTansaProof) {
                    return;
                }

                // continueAfterPublish is passed only from $scope.publishAndContinue as bool,
                // in other cases this is object (don't use parameter in those cases)
                let publishFn = continueAfterPublish === true ? $scope.publishAndContinue : $scope.publish;
                if (isCancelled) {
                    isCheckedByTansa = true;
                    publishFn();
                } else {
                    // after changes from tansa, there is some time needed for autosave
                    // and for commiting scope in editor
                    $timeout(() => {
                        isCheckedByTansa = true;
                        $scope.saveTopbar().then(publishFn);
                    }, 1000);
                }
            }

            /**
             * Depending on the item state one of the publish, correct, kill actions will be executed on the item
             * in $scope.
             */
            $scope.publish = function(continueOnPublish) {
                if ($scope.useTansaProofing() && $scope.item.urgency > 3 && !isCheckedByTansa) {
                    var act = 'publish';
                    if ($scope.origItem && $scope.origItem.state === 'published') {
                        act = 'correct';
                    }
                    return authoring.validateBeforeTansa($scope.origItem, $scope.item, act)
                    .then(function(response) {
                        continueAfterPublish = continueOnPublish;
                        if (response.errors.length) {
                            validate($scope.origItem, $scope.item);
                            for (var i = 0; i < response.errors.length; i++) {
                                notify.error('\'' + _.trim(response.errors[i]) + '\'');
                            }
                        } else {
                            $scope.runTansa();
                            onlyTansaProof = false;
                        }
                    });
                } else if (validatePublishScheduleAndEmbargo($scope.item) && validateForPublish($scope.item)) {
                    var message = 'publish';
                    if ($scope.action && $scope.action !== 'edit') {
                        message = $scope.action;
                    }

                    if ($scope.dirty && message === 'publish') {
                        // confirmation only required for publish
                        return authoring.publishConfirmation($scope.origItem, $scope.item, $scope.dirty, message)
                        .then(function(res) {
                            if (res) {
                                return publishItem($scope.origItem, $scope.item);
                            }
                        }, function(response) {
                            notify.error(gettext('Error. Item not published.'));
                            return false;
                        });
                    }

                    return publishItem($scope.origItem, $scope.item);
                }

                return false;
            };

            $scope.showCustomButtons = function(item) {
                return item.task && item.task.desk && item.state !== 'draft' || $scope.dirty;
            };

            $scope.saveAndContinue = function(customButtonAction) {
                if ($scope.dirty) {
                    $scope.saveTopbar().then(customButtonAction);
                } else {
                    customButtonAction();
                }
            };

            $scope.publishAndContinue = function() {
                $scope.publish(true).then(function(published) {
                    if (published) {
                        authoring.rewrite($scope.item);
                    }
                }, function(err) {
                    notify.error(gettext('Failed to publish and continue.'));
                });
            };

            $scope.deschedule = function() {
                $scope.item.publish_schedule = null;
                return $scope.save();
            };

            /**
             * Close an item - unlock
             */
            $scope.close = function() {
                _closing = true;
                authoring.close($scope.item, $scope.origItem, $scope.save_enabled()).then(function() {
                    authoringWorkspace.close(true);
                });
            };

            /*
             * Minimize an item
             */
            $scope.minimize = function() {
                authoringWorkspace.close(true);
            };

            $scope.closeOpenNew = function(createFunction, paramValue) {
                _closing = true;
                authoring.close($scope.item, $scope.origItem, $scope.dirty, true).then(function() {
                    createFunction(paramValue);
                });
            };

            /**
             * Called by the sendItem directive before send.
             * If the $scope is dirty then upon confirmation save the item and then unlock the item.
             * If the $scope is not dirty then unlock the item.
             * @param {String} action - action to display in confirmation dialog
             * @return {Object} promise
             */
            $scope.beforeSend = function(action) {
                $scope.sending = true;
                if ($scope.dirty) {
                    return confirm.confirmSendTo(action)
                    .then(function() {
                        return $scope.save().then(function() {
                            return lock.unlock($scope.origItem);
                        });
                    }, function() { // cancel
                        return $q.reject();
                    });
                }

                return lock.unlock($scope.origItem);
            };

            /**
             * Preview different version of an item
             */
            $scope.preview = function(version) {
                helpers.forcedExtend($scope.item, version);
                $scope._editable = false;
            };

            /**
             * Revert item to given version
             */
            $scope.revert = function(version) {
                helpers.forcedExtend($scope.item, version);
                return $scope.save();
            };

            /**
             * Close preview and start working again
             */
            $scope.closePreview = function() {
                $scope.item = _.create($scope.origItem);
                $scope._editable = $scope.action !== 'view' && authoring.isEditable($scope.origItem);

                // populate content fields so that it can undo to initial (empty) version later
                var autosave = $scope.origItem._autosave || {};
                Object.keys(helpers.CONTENT_FIELDS_DEFAULTS).forEach(function(key) {
                    var value = autosave[key] || $scope.origItem[key] || helpers.CONTENT_FIELDS_DEFAULTS[key];
                    $scope.item[key] = angular.copy(value);
                });
            };

            /**
             * Checks if the item can be unlocked or not.
             */
            $scope.can_unlock = function() {
                return !$scope.item.sendTo && lock.can_unlock($scope.item);
            };

            $scope.save_enabled = function() {
                confirm.dirty = $scope.dirty;
                return $scope.dirty || $scope.item._autosave;
            };

            $scope.previewFormattedEnabled = function() {
                return !!$rootScope.config.previewFormats;
            };

            // call the function to unlock and lock the story for editing.
            $scope.unlock = function() {
                $scope.unlockClicked = true;
                lock.unlock($scope.item).then(function(unlockedItem) {
                    $scope.edit(unlockedItem);
                });
            };

            $scope.openAction = function(action) {
                if (action === 'correct') {
                    authoringWorkspace.correct($scope.item);
                } else if (action === 'kill') {
                    authoringWorkspace.kill($scope.item);
                } else if (action === 'rewrite') {
                    authoring.rewrite($scope.item);
                }
            };

            $scope.isLocked = function() {
                return lock.isLocked($scope.item);
            };

            $scope.isLockedByMe = function() {
                return lock.isLockedByMe($scope.item);
            };

            $scope.autosave = function(item) {
                if (item !== $scope.item) {
                    // keep items in sync
                    $scope.item = item;
                }

                $scope.dirty = true;

                isCheckedByTansa = false;

                if (tryPublish) {
                    validate($scope.origItem, $scope.item);
                }

                var autosavedItem = authoring.autosave($scope.item, $scope.origItem);
                authoringWorkspace.addAutosave();
                return autosavedItem;
            };

            $scope.sendToNextStage = function() {
                var stageIndex, stageList = desks.deskStages[desks.activeDeskId];
                for (var i = 0; i < stageList.length; i++) {
                    if (stageList[i]._id === $scope.stage._id) {
                        stageIndex = i + 1 === stageList.length ? 0 : i + 1;
                        break;
                    }
                }

                $rootScope.$broadcast('item:nextStage', {stage: stageList[stageIndex], itemId: $scope.item._id});
            };

            function refreshItem() {
                authoring.open($scope.item._id, true)
                    .then(function(item) {
                        $scope.origItem = item;
                        $scope.dirty = false;
                        $scope.closePreview();
                        $scope.item._editable = $scope._editable;
                    });
            }

            $scope.$on('savework', function(e, msg) {
                var changeMsg = msg;
                authoring.saveWorkConfirmation($scope.origItem, $scope.item, $scope.dirty, changeMsg)
                .then(function(res) {
                    // after saving work make sure this item won't be open again
                    desks.setCurrentDeskId(null);
                    $location.search('item', null);
                    $location.search('action', null);
                })
                .finally(reloadService.forceReload);
            });

            $scope.$on('item:lock', function(_e, data) {
                if ($scope.item._id === data.item && !_closing &&
                    session.sessionId !== data.lock_session) {
                    authoring.lock($scope.item, data.user);
                }
            });

            $scope.$on('item:unlock', function(_e, data) {
                if ($scope.item._id === data.item && !_closing &&
                    (session.sessionId !== data.lock_session || lock.previewUnlock)) {
                    if (lock.previewUnlock) {
                        $scope.unlock();
                        lock.previewUnlock = false;
                    } else {
                        authoring.unlock($scope.item, data.user);
                        $scope._editable = $scope.item._editable = false;
                        $scope.origItem._locked = $scope.item._locked = false;
                        $scope.origItem.lock_session = $scope.item.lock_session = null;
                        $scope.origItem.lock_user = $scope.item.lock_user = null;

                        if (data.state && data.state !== $scope.item.state) {
                            $scope.item.state = data.state;
                            $scope.origItem.state = data.state;
                        }
                    }
                }
            });

            $scope.$on('content:update', function(_e, data) {
                if (!$scope._editable && data.items && data.items[$scope.origItem._id]) {
                    refreshItem();
                }
            });

            $scope.$on('item:publish:wrong:format', function(_e, data) {
                if (data.item === $scope.item._id) {
                    notify.error(gettext('No formatters found for ') + data.formats.join(',') +
                        ' while publishing item having unique name ' + data.unique_name);
                }
            });

            $scope.$on('item:highlight', function(e, data) {
                if ($scope.item._id === data.item_id) {
                    if (!$scope.item.highlights) {
                        $scope.item.highlights = [data.highlight_id];
                    } else if ($scope.item.highlights.indexOf(data.highlight_id) === -1) {
                        $scope.item.highlights = [data.highlight_id].concat($scope.item.highlights);
                    } else if (!$scope.item.multiSelect) {
                        $scope.item.highlights = _.without($scope.item.highlights, data.highlight_id);
                    }
                }
            });

            $scope.$on('$destroy', deregisterTansa);

            // init
            $scope.content = content;
            $scope.closePreview();
            macros.setupShortcuts($scope);
        }
    };
}
