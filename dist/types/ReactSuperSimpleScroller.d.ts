import React, { ReactElement } from 'react';
export type CellPack = {
    id: any;
    component: ReactElement;
};
export type FetchContext = {
    attempt: number;
    signal: AbortSignal;
};
export type FetchCells = (startCode: 'at' | 'after' | 'before', referenceID: any, count: number, context: FetchContext) => CellPack[] | Promise<CellPack[]>;
export type PlaceholderProps = {
    context: any;
    index: number;
    direction: 'forward' | 'backward';
    referenceID: any;
};
export type EndIndicatorProps = {
    context: any;
    end: 'start' | 'end';
    searching: boolean;
    orientation: 'vertical' | 'horizontal';
};
export type AxisContext = {
    isPlaceholder: true;
    referenceID: any;
    direction: 'forward' | 'backward';
};
export type ReactSuperSimpleScrollerProps = {
    orientation?: 'vertical' | 'horizontal';
    layout?: 'uniform' | 'variable';
    cellDimensions: {
        maxHeight: number;
        maxWidth: number;
        minHeight: number;
        minWidth: number;
    };
    seedReferenceID: any;
    fetchCells: FetchCells;
    callbacks?: {
        axisReferenceID?: Function;
        failed?: Function;
        removed?: Function;
        error?: Function;
        warning?: Function;
        resized?: Function;
    };
    calls?: {
        has?: null | Function;
        insert?: null | Function;
        remove?: null | Function;
        move?: null | Function;
        replace?: null | Function;
        getCradleIDList?: null | Function;
        getCradleSpecs?: null | Function;
        fetchCradleCells?: null | Function;
    };
    technical?: {
        STANDARD_SCROLL_MOMENTUM_FADE?: number;
        SHORT_MOMENTUM_FADE?: number;
        FETCH_CEILING?: number;
    };
    spacing?: {
        cradleMargin?: number[];
        bandPadding?: number[];
        cellGap?: number;
    };
    operations?: {
        dispatchAttachedEvents?: boolean;
        runway?: number;
        crossAxisChaining?: boolean;
        placeholderCap?: number;
        placeholderSpreadRatio?: number | null;
        placeholder?: React.ComponentType<PlaceholderProps>;
        placeholderContext?: any;
        endIndicator?: React.ComponentType<EndIndicatorProps>;
        endIndicatorContext?: any;
        fixedEnds?: boolean | {
            start?: boolean;
            end?: boolean;
        };
    };
    scrollerName?: string;
};
declare const ReactSuperSimpleScroller: ({ orientation, layout, cellDimensions, seedReferenceID, fetchCells, ...moreProperties }: ReactSuperSimpleScrollerProps) => any;
export default ReactSuperSimpleScroller;
