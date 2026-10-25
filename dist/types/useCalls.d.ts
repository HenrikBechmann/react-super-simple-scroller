import { FC } from 'react';
declare const useCalls: ({ runwayBandsRef, DOMManipulationQueueRef, scrollerName, operationsRef, portalIDListRef, cellPortalListRef, cellDataListRef, portalContainerMapRef, spacingRef, scrollTopRef, scrollLeftRef, viewportRef, headblockRef, tailblockRef, headBandListRef, tailBandListRef, leadHeadblockBandRef, cradleActualRef, cradlePotentialRef, cellDimensionsRef, viewportDimensionsRef, orientationRef, layoutRef, currentAxisReferenceIDRef, setPortalRenderList, updateCurrentAxisReferenceID, trimCradle, fillCradle, reset, callbacksRef, assertIntersectionsDisconnect, requestIntersectionsConnect, bandMutationObserverRef, }: {
    runwayBandsRef: any;
    DOMManipulationQueueRef: any;
    scrollerName: any;
    operationsRef: any;
    portalIDListRef: any;
    cellPortalListRef: any;
    cellDataListRef: any;
    portalContainerMapRef: any;
    spacingRef: any;
    scrollTopRef: any;
    scrollLeftRef: any;
    viewportRef: any;
    headblockRef: any;
    tailblockRef: any;
    headBandListRef: any;
    tailBandListRef: any;
    leadHeadblockBandRef: any;
    cradleActualRef: any;
    cradlePotentialRef: any;
    cellDimensionsRef: any;
    viewportDimensionsRef: any;
    orientationRef: any;
    layoutRef: any;
    currentAxisReferenceIDRef: any;
    setPortalRenderList: any;
    updateCurrentAxisReferenceID: any;
    trimCradle: any;
    fillCradle: any;
    reset: any;
    callbacksRef: any;
    assertIntersectionsDisconnect: any;
    requestIntersectionsConnect: any;
    bandMutationObserverRef: any;
}) => {
    has: (referenceID: any) => any;
    insert: (cellPack: {
        id: any;
        component: FC;
    }, targetReferenceID: any, position?: "before" | "after") => Promise<any>;
    remove: (targetReferenceID: any) => Promise<any>;
    move: (sourceReferenceID: any, targetReferenceID: any, position?: "before" | "after") => Promise<any>;
    replace: (referenceID: any, cellPack?: {
        id: any;
        component: any;
        default: boolean;
    }) => Promise<any>;
    getCradleIDList: () => any[];
    getCradleSpecs: () => {
        cradleActual: any;
        cradlePotential: any;
    };
    fetchCradleCells: (seedReferenceID?: any) => Promise<any>;
    restoreScrollPositions: () => any;
    dispatchEvent: (referenceID: any, event: any) => boolean;
};
export default useCalls;
