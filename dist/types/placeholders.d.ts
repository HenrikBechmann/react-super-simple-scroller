export declare const placeholderID: (generation: any, serial: any) => string;
export declare const isPlaceholderID: (id: any) => any;
export declare const DEFAULT_FETCH_CEILING = 5000;
export declare const createPlaceholderState: () => {
    generation: number;
    serial: number;
    askSerial: number;
    map: Map<any, any>;
    pending: any;
    inlineController: any;
    badOptions: Map<any, any>;
    quiet: {
        forward: any;
        backward: any;
    };
    endAsk: {
        forward: any;
        backward: any;
    };
};
export declare const END_INDICATOR_TEXT: {
    start: string;
    end: string;
    searching: string;
};
export declare const endIndicatorText: (context: any, end: any, searching: any) => any;
export declare const DefaultPlaceholder: ({ context }: {
    context: any;
}) => any;
export declare const DefaultEndIndicator: ({ context, end, searching, orientation }: {
    context: any;
    end: any;
    searching: any;
    orientation: any;
}) => any;
