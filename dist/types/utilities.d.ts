export declare const isValidID: (referenceID: any) => boolean;
export declare const errorMessage: (error: any) => string;
export declare const reportError: (callbacksRef: any, source: any, message: any, args?: any[], extra?: {}) => void;
export declare const reportWarning: (callbacksRef: any, source: any, message: any, args?: any[], extra?: {}) => void;
export declare const reportFailed: (callbacksRef: any, source: any, message: any, excessList: any) => void;
export declare const baseCradleActual: {
    cellsPerBand: any;
    totalBands: number;
    forwardBands: number;
    backwardBands: number;
    forwardCells: number;
    backwardCells: number;
    totalCells: number;
};
export declare const isSize: (value: any) => boolean;
export declare const DEFAULT_SPACING: {
    cradleMargin: number[];
    bandPadding: number[];
    cellGap: number;
};
export declare const validateSpacing: (spacing: any, lastGood?: {
    cradleMargin: number[];
    bandPadding: number[];
    cellGap: number;
}) => {
    value: {
        cradleMargin: any;
        bandPadding: any;
        cellGap: any;
    };
    problems: any[];
};
export declare const ORIENTATIONS: string[];
export declare const LAYOUTS: string[];
export declare const validateOption: (property: any, value: any, options: any, lastGood: any) => {
    value: any;
    problems: {
        property: any;
        value: any;
        used: any;
        message: string;
    }[];
};
export declare const cellDimensionsReadSet: (orientation: any, layout: any) => {
    divides: string[];
    reads: string[];
};
export declare const validateCellDimensions: (cellDimensions: any, lastGood?: any, orientation?: string, layout?: string) => {
    value: any;
    problems: any[];
};
export declare const createContainer: (id: any, cellDimensions: any, cellsPerBand: any, orientation: any, layout: any) => HTMLDivElement;
export declare const createBand: (orientation: any, layout: any, cellsPerBand: any, spacing: any, bandMutationObserver: any) => HTMLDivElement;
