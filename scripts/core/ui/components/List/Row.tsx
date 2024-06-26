import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

/**
 * @ngdoc react
 * @name Row
 * @description Row Component in a list of item where each item is a row
 */
export const Row: React.StatelessComponent<any> = ({children, classes, paddingBlockEnd}) => (
    <div
        className={classNames(
            'sd-list-item__row',
            classes,
            {
                'sd-list-item__row--padding-b5': paddingBlockEnd,
            },
        )}
    >
        {children}
    </div>
);

Row.propTypes = {
    children: PropTypes.node.isRequired,
    classes: PropTypes.string,
    margin: PropTypes.bool,
    marginBlockStart: PropTypes.bool,
    paddingBlockEnd: PropTypes.bool,
};

Row.defaultProps = {
    classes: '',
    margin: true,
    marginBlockStart: false,
};
