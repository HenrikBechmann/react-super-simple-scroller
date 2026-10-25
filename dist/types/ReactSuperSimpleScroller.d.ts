import { ReactElement } from 'react';
export type CellPack = {
    id: any;
    component: ReactElement;
};
export type FetchCells = (direction: 'seed' | 'forward' | 'backward', referenceID: any, count: number) => CellPack[] | Promise<CellPack[]>;
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
    };
    scrollerName?: string;
};
declare const ReactSuperSimpleScroller: ({ orientation, layout, cellDimensions, seedReferenceID, fetchCells, ...moreProperties }: ReactSuperSimpleScrollerProps) => any;
export default ReactSuperSimpleScroller;
