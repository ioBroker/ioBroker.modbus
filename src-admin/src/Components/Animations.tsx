import React, { useState } from 'react';

/** True if the user asked the system for less motion */
export function prefersReducedMotion(): boolean {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays the CSS animation of `className` every time `value` changes, but not on the first render
 * (so the icons do not all jump when the page is opened).
 */
export function PopOnChange(props: {
    value: string | number | boolean;
    /** Default: `modbus-pop` (see animations.css) */
    className?: string;
    children: React.ReactNode;
}): React.JSX.Element {
    const [previous, setPrevious] = useState(props.value);
    const [changed, setChanged] = useState(false);
    if (previous !== props.value) {
        // adjusting the state while rendering (instead of in an effect) avoids a second render
        setPrevious(props.value);
        setChanged(true);
    }

    return (
        <span
            // a new key mounts a new element, so the animation starts again
            key={String(props.value)}
            className={changed ? props.className || 'modbus-pop' : undefined}
            style={{ display: 'inline-flex' }}
        >
            {props.children}
        </span>
    );
}
