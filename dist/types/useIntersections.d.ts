declare const useIntersections: ({ scrollerName, standardMomentumFadeRef, shortMomentumFadeRef, AXIS_START_POSITION, DOMManipulationQueueRef, orientationRef, layoutRef, viewportRef, headblockRef, leadHeadblockBandRef, headblockOverflowTriggerRef, tailblockRef, tailblockOverflowTriggerRef, leadTailblockBandRef, cradleActualRef, cradlePotentialRef, headBandListRef, tailBandListRef, intersectionsMapRef, scrollTopRef, scrollLeftRef, axisPositionRef, portalIDListRef, immediateIsScrollingRef, lastScrollEventTimeRef, immediateStopScrollingRef, restoreScrollingTimeoutIDRef, callbacksRef, setAxisPosition, assertIntersectionsDisconnect, requestIntersectionsConnect, fillCradle, updateCurrentAxisReferenceID, trimCradle, isFetchOpenAt, isEndFixed, markQuiet, isQuietAt, clearQuietAt, isEndAskAt, onRunEndedRef, bringOutrunCradleRef, setEndIndicators, }: {
    scrollerName: any;
    standardMomentumFadeRef: any;
    shortMomentumFadeRef: any;
    AXIS_START_POSITION: any;
    DOMManipulationQueueRef: any;
    orientationRef: any;
    layoutRef: any;
    viewportRef: any;
    headblockRef: any;
    leadHeadblockBandRef: any;
    headblockOverflowTriggerRef: any;
    tailblockRef: any;
    tailblockOverflowTriggerRef: any;
    leadTailblockBandRef: any;
    cradleActualRef: any;
    cradlePotentialRef: any;
    headBandListRef: any;
    tailBandListRef: any;
    intersectionsMapRef: any;
    scrollTopRef: any;
    scrollLeftRef: any;
    axisPositionRef: any;
    portalIDListRef: any;
    immediateIsScrollingRef: any;
    lastScrollEventTimeRef: any;
    immediateStopScrollingRef: any;
    restoreScrollingTimeoutIDRef: any;
    callbacksRef: any;
    setAxisPosition: any;
    assertIntersectionsDisconnect: any;
    requestIntersectionsConnect: any;
    fillCradle: any;
    updateCurrentAxisReferenceID: any;
    trimCradle: any;
    isFetchOpenAt: any;
    isEndFixed: any;
    markQuiet: any;
    isQuietAt: any;
    clearQuietAt: any;
    isEndAskAt: any;
    onRunEndedRef: any;
    bringOutrunCradleRef: any;
    setEndIndicators: any;
}) => {
    evaluateIntersections: any;
    followViewport: (shift?: any) => Promise<void>;
    bringOutrunCradle: () => boolean;
    onEndScroll: () => void;
    onEndScrollingModeEnd: (scrollUnheard: any) => void;
    onEndWheel: (event: any) => void;
    onEndTouchStart: (event: any) => void;
    isBringingBack: () => boolean;
    endStateReport: () => {
        head: {
            inside: boolean;
            mark: any;
            slack: number;
            contentEdge: any;
        } | {
            inside: true;
            mark: any;
            slack: number;
            contentEdge: any;
        };
        tail: {
            inside: boolean;
            mark: any;
            slack: number;
            contentEdge: any;
        } | {
            inside: true;
            mark: any;
            slack: number;
            contentEdge: any;
        };
    };
};
export default useIntersections;
