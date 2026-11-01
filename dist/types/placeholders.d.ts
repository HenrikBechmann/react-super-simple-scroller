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
    endOfData: {
        forward: any;
        backward: any;
    };
};
export declare const DefaultPlaceholder: ({ context }: {
    context: any;
}) => any;
