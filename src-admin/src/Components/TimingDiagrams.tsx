import React from 'react';

import type { ThemeType } from '@iobroker/gui-components';

/** Every timing that has its own diagram. The keys are the names in `native.params` */
export type TimingKey =
    'poll' | 'recon' | 'timeout' | 'pulseTime' | 'waitTime' | 'readInterval' | 'writeInterval' | 'notifyOnReadExpire';

/** i18n keys (the same ones the JSON config schema uses) and the signature line of the tooltip */
export const TIMINGS: Record<TimingKey, { label: string; help: string; signature: string }> = {
    poll: { label: 'Poll delay', help: 'poll_help', signature: 'params.poll · 1000 ms' },
    recon: { label: 'Reconnect time', help: 'recon_help', signature: 'params.recon · 60000 ms' },
    timeout: { label: 'Read timeout', help: 'timeout_help', signature: 'params.timeout · 5000 ms' },
    pulseTime: { label: 'Pulse time', help: 'pulsetime_help', signature: 'params.pulseTime · 1000 ms' },
    waitTime: { label: 'Wait time', help: 'waitTime_help', signature: 'params.waitTime · 50 ms' },
    readInterval: { label: 'Read interval', help: 'readInterval_help', signature: 'params.readInterval · 0 ms' },
    writeInterval: { label: 'Write interval', help: 'writeInterval_help', signature: 'params.writeInterval · 0 ms' },
    notifyOnReadExpire: {
        label: 'Counter expire time',
        help: 'notifyOnReadExpire_help',
        signature: 'params.notifyOnReadExpire · 0 s = off',
    },
};

interface Palette {
    text: string;
    muted: string;
    req: string;
    res: string;
    state: string;
    conn: string;
    meas: string;
    err: string;
    guide: string;
}

const PALETTE: Record<'light' | 'dark', Palette> = {
    light: {
        text: '#171c26',
        muted: '#606a7b',
        req: '#0f9d58',
        res: '#e08e0b',
        state: '#7c4dff',
        conn: '#0b7fd4',
        meas: '#1a56db',
        err: '#c62828',
        guide: '#b9c1cd',
    },
    dark: {
        text: '#e8ecf4',
        muted: '#98a2b6',
        req: '#4ade80',
        res: '#fbbf24',
        state: '#a78bfa',
        conn: '#38bdf8',
        meas: '#60a5fa',
        err: '#f87171',
        guide: '#4a5470',
    },
};

const FONT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Digital trace: low at `lo`, high at `hi`, high during every `[from, to]` span */
function trace(lo: number, hi: number, x0: number, x1: number, spans: [number, number][]): string {
    let d = `M${x0},${lo}`;
    for (const [from, to] of spans) {
        d += ` H${from} V${hi} H${to} V${lo}`;
    }
    return `${d} H${x1}`;
}

function Signal({ d, color, width = 2.2 }: { d: string; color: string; width?: number }): React.JSX.Element {
    return (
        <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinejoin="round"
        />
    );
}

/** Double headed measurement arrow. Drawn with own triangles, so several diagrams can share a page */
function Measure({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: string }): React.JSX.Element {
    const head = 6;
    return (
        <g>
            <line
                x1={x1 + head}
                x2={x2 - head}
                y1={y}
                y2={y}
                stroke={color}
                strokeWidth={1.4}
            />
            <path
                d={`M${x1},${y} l${head},-4 v8 z`}
                fill={color}
            />
            <path
                d={`M${x2},${y} l-${head},4 v-8 z`}
                fill={color}
            />
        </g>
    );
}

function Guides({ x, y1, y2, color }: { x: number[]; y1: number; y2: number; color: string }): React.JSX.Element {
    return (
        <path
            d={x.map(v => `M${v},${y1} V${y2}`).join(' ')}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 3"
            fill="none"
        />
    );
}

// ---------------------------------------------------------------- large ----
// Geometry of the big diagram shown in the tooltip
const L = {
    w: 520,
    h: 176,
    x0: 112,
    x1: 504,
    lab: 104,
    note: 20,
    r1hi: 34,
    r1lo: 62,
    r2hi: 82,
    r2lo: 110,
    guideTop: 28,
    arrow: 152,
    arrowLabel: 144,
};

function RowLabel({ y, text, color }: { y: number; text: string; color: string }): React.JSX.Element {
    return (
        <text
            x={L.lab}
            y={y}
            textAnchor="end"
            fontSize={11.5}
            fontWeight={600}
            fill={color}
        >
            {text}
        </text>
    );
}

function Note({
    x,
    y,
    text,
    color,
    anchor = 'middle',
}: {
    x: number;
    y: number;
    text: string;
    color: string;
    anchor?: 'start' | 'middle' | 'end';
}): React.JSX.Element {
    return (
        <text
            x={x}
            y={y}
            textAnchor={anchor}
            fontSize={10}
            fill={color}
        >
            {text}
        </text>
    );
}

function MeasureLabel({ x, text, color }: { x: number; text: string; color: string }): React.JSX.Element {
    return (
        <text
            x={x}
            y={L.arrowLabel}
            textAnchor="middle"
            fontSize={11.5}
            fontWeight={700}
            fill={color}
        >
            {text}
        </text>
    );
}

function renderLarge(id: TimingKey, p: Palette): React.JSX.Element {
    const row1 = (spans: [number, number][], color: string): React.JSX.Element => (
        <Signal
            d={trace(L.r1lo, L.r1hi, L.x0, L.x1, spans)}
            color={color}
        />
    );
    const row2 = (spans: [number, number][], color: string): React.JSX.Element => (
        <Signal
            d={trace(L.r2lo, L.r2hi, L.x0, L.x1, spans)}
            color={color}
        />
    );
    const measure = (x1: number, x2: number, text: string): React.JSX.Element => (
        <>
            <Guides
                x={[x1, x2]}
                y1={L.guideTop}
                y2={L.arrow}
                color={p.guide}
            />
            <Measure
                x1={x1}
                x2={x2}
                y={L.arrow}
                color={p.meas}
            />
            <MeasureLabel
                x={(x1 + x2) / 2}
                text={text}
                color={p.meas}
            />
        </>
    );

    switch (id) {
        case 'poll':
            return (
                <>
                    <path
                        d="M130,26 V20 H240 V26 M330,26 V20 H440 V26"
                        stroke={p.guide}
                        fill="none"
                        strokeWidth={1}
                    />
                    <Note
                        x={185}
                        y={14}
                        text="one polling cycle"
                        color={p.muted}
                    />
                    <RowLabel
                        y={52}
                        text="Request"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="Response"
                        color={p.res}
                    />
                    {row1(
                        [
                            [130, 146],
                            [190, 206],
                            [330, 346],
                            [390, 406],
                        ],
                        p.req,
                    )}
                    {row2(
                        [
                            [160, 180],
                            [220, 240],
                            [360, 380],
                            [420, 440],
                        ],
                        p.res,
                    )}
                    {measure(240, 330, 'Poll delay')}
                </>
            );

        case 'recon':
            return (
                <>
                    <RowLabel
                        y={52}
                        text="Request"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="info.connection"
                        color={p.conn}
                    />
                    {row1([[130, 146]], p.req)}
                    <Note
                        x={156}
                        y={52}
                        text="no answer → connection closed"
                        color={p.err}
                        anchor="start"
                    />
                    <Signal
                        d={`M${L.x0},${L.r2hi} H230 V${L.r2lo} H400 V${L.r2hi} H${L.x1}`}
                        color={p.conn}
                    />
                    <Note
                        x={408}
                        y={76}
                        text="connected"
                        color={p.muted}
                        anchor="start"
                    />
                    {measure(230, 400, 'Reconnect time')}
                </>
            );

        case 'timeout':
            return (
                <>
                    <rect
                        x={130}
                        y={L.guideTop}
                        width={230}
                        height={L.r2lo - L.guideTop}
                        fill={p.meas}
                        opacity={0.08}
                        rx={3}
                    />
                    <RowLabel
                        y={52}
                        text="Request"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="Response"
                        color={p.res}
                    />
                    {row1([[130, 146]], p.req)}
                    {row2([[300, 320]], p.res)}
                    <Note
                        x={366}
                        y={100}
                        text="too late → reconnect"
                        color={p.err}
                        anchor="start"
                    />
                    {measure(130, 360, 'Read timeout')}
                </>
            );

        case 'pulseTime':
            return (
                <>
                    <RowLabel
                        y={52}
                        text="Write request"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="Coil in device"
                        color={p.state}
                    />
                    <Note
                        x={158}
                        y={L.note}
                        text="true"
                        color={p.muted}
                    />
                    <Note
                        x={338}
                        y={L.note}
                        text="false (by the adapter)"
                        color={p.muted}
                    />
                    {row1(
                        [
                            [150, 166],
                            [330, 346],
                        ],
                        p.req,
                    )}
                    <Signal
                        d={`M${L.x0},${L.r2lo} H158 V${L.r2hi} H338 V${L.r2lo} H${L.x1}`}
                        color={p.state}
                    />
                    {measure(158, 338, 'Pulse time')}
                </>
            );

        case 'waitTime':
            return (
                <>
                    <Note
                        x={155}
                        y={L.note}
                        text="device ID 1"
                        color={p.muted}
                    />
                    <Note
                        x={325}
                        y={L.note}
                        text="device ID 2"
                        color={p.muted}
                    />
                    <RowLabel
                        y={52}
                        text="Request"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="Response"
                        color={p.res}
                    />
                    {row1(
                        [
                            [130, 146],
                            [300, 316],
                        ],
                        p.req,
                    )}
                    {row2(
                        [
                            [160, 180],
                            [330, 350],
                        ],
                        p.res,
                    )}
                    {measure(180, 300, 'Wait time')}
                </>
            );

        case 'readInterval':
            return (
                <>
                    <Note
                        x={L.x0}
                        y={L.note}
                        text="two read requests of the same device"
                        color={p.muted}
                        anchor="start"
                    />
                    <RowLabel
                        y={52}
                        text="Read request"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="Response"
                        color={p.res}
                    />
                    {row1(
                        [
                            [130, 146],
                            [300, 316],
                        ],
                        p.req,
                    )}
                    {row2(
                        [
                            [160, 180],
                            [330, 350],
                        ],
                        p.res,
                    )}
                    {measure(180, 300, 'Read interval')}
                </>
            );

        case 'writeInterval':
            return (
                <>
                    <Note
                        x={L.x0}
                        y={L.note}
                        text="two write requests"
                        color={p.muted}
                        anchor="start"
                    />
                    <RowLabel
                        y={52}
                        text="Write request"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="Response"
                        color={p.res}
                    />
                    {row1(
                        [
                            [130, 146],
                            [300, 316],
                        ],
                        p.req,
                    )}
                    {row2(
                        [
                            [160, 180],
                            [330, 350],
                        ],
                        p.res,
                    )}
                    {measure(180, 300, 'Write interval')}
                </>
            );

        case 'notifyOnReadExpire':
            return (
                <>
                    <Note
                        x={138}
                        y={L.note}
                        text="1"
                        color={p.muted}
                    />
                    <Note
                        x={218}
                        y={L.note}
                        text="2"
                        color={p.muted}
                    />
                    <Note
                        x={298}
                        y={L.note}
                        text="3"
                        color={p.muted}
                    />
                    <RowLabel
                        y={52}
                        text="Read by master"
                        color={p.req}
                    />
                    <RowLabel
                        y={100}
                        text="readNotify.…"
                        color={p.state}
                    />
                    {row1(
                        [
                            [130, 146],
                            [210, 226],
                            [290, 306],
                        ],
                        p.req,
                    )}
                    <Signal
                        d={`M${L.x0},${L.r2lo} H138 V${L.r2hi} H440 V${L.r2lo} H${L.x1}`}
                        color={p.state}
                    />
                    <Note
                        x={446}
                        y={104}
                        text="expired"
                        color={p.err}
                        anchor="start"
                    />
                    {measure(306, 440, 'Counter expire time')}
                </>
            );
    }
}

// ---------------------------------------------------------------- small ----
// Pictogram shown directly next to the input field - the same shapes, without any text
const S = { w: 120, h: 44, x0: 6, x1: 114, arrow: 38 };

function renderSmall(id: TimingKey, p: Palette): React.JSX.Element {
    const measure = (x1: number, x2: number, y = S.arrow): React.JSX.Element => (
        <Measure
            x1={x1}
            x2={x2}
            y={y}
            color={p.meas}
        />
    );

    switch (id) {
        case 'poll':
            return (
                <>
                    <rect
                        x={6}
                        y={8}
                        width={34}
                        height={16}
                        rx={3}
                        fill="none"
                        stroke={p.req}
                        strokeWidth={2}
                    />
                    <rect
                        x={74}
                        y={8}
                        width={40}
                        height={16}
                        rx={3}
                        fill="none"
                        stroke={p.req}
                        strokeWidth={2}
                    />
                    {measure(40, 74)}
                </>
            );

        case 'recon':
            return (
                <>
                    <Signal
                        d="M6,12 H36 V26 H84 V12 H114"
                        color={p.conn}
                    />
                    {measure(36, 84)}
                </>
            );

        case 'timeout':
            return (
                <>
                    <Signal
                        d={trace(24, 10, S.x0, S.x1, [[10, 20]])}
                        color={p.req}
                    />
                    <Guides
                        x={[76]}
                        y1={6}
                        y2={32}
                        color={p.guide}
                    />
                    {measure(10, 76)}
                </>
            );

        case 'pulseTime':
            return (
                <>
                    <Signal
                        d="M6,26 H34 V12 H86 V26 H114"
                        color={p.state}
                    />
                    {measure(34, 86)}
                </>
            );

        case 'waitTime':
            return (
                <>
                    <Signal
                        d={trace(20, 8, S.x0, S.x1, [
                            [12, 22],
                            [84, 94],
                        ])}
                        color={p.req}
                    />
                    <text
                        x={17}
                        y={32}
                        textAnchor="middle"
                        fontSize={9}
                        fill={p.muted}
                    >
                        1
                    </text>
                    <text
                        x={89}
                        y={32}
                        textAnchor="middle"
                        fontSize={9}
                        fill={p.muted}
                    >
                        2
                    </text>
                    {measure(22, 84, 40)}
                </>
            );

        case 'readInterval':
            return (
                <>
                    <Signal
                        d={trace(18, 8, S.x0, S.x1, [
                            [12, 22],
                            [84, 94],
                        ])}
                        color={p.req}
                        width={2}
                    />
                    <Signal
                        d={trace(32, 22, S.x0, S.x1, [
                            [28, 38],
                            [100, 110],
                        ])}
                        color={p.res}
                        width={2}
                    />
                    {measure(22, 84, 40)}
                </>
            );

        case 'writeInterval':
            return (
                <>
                    <Signal
                        d={trace(26, 10, S.x0, S.x1, [
                            [12, 22],
                            [84, 94],
                        ])}
                        color={p.req}
                    />
                    {measure(22, 84)}
                </>
            );

        case 'notifyOnReadExpire':
            return (
                <>
                    <Signal
                        d={trace(18, 8, S.x0, S.x1, [
                            [10, 18],
                            [30, 38],
                            [50, 58],
                        ])}
                        color={p.req}
                        width={2}
                    />
                    <Signal
                        d="M6,32 H14 V24 H92 V32 H114"
                        color={p.state}
                        width={2}
                    />
                    {measure(58, 92, 40)}
                </>
            );
    }
}

interface TimingDiagramProps {
    id: TimingKey;
    themeType: ThemeType;
    variant: 'small' | 'large';
    style?: React.CSSProperties;
}

/** Timing diagram of one configuration field: a pictogram for the form, a labelled one for the tooltip */
export default function TimingDiagram(props: TimingDiagramProps): React.JSX.Element {
    const p = PALETTE[props.themeType === 'dark' ? 'dark' : 'light'];
    const large = props.variant === 'large';
    const box = large ? L : S;

    return (
        <svg
            viewBox={`0 0 ${box.w} ${box.h}`}
            width="100%"
            style={{ display: 'block', fontFamily: FONT, ...props.style }}
            role="img"
            aria-label={TIMINGS[props.id].label}
        >
            {large ? renderLarge(props.id, p) : renderSmall(props.id, p)}
        </svg>
    );
}
