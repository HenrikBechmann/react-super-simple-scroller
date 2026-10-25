declare const useRemoveCells: ({ portalIDListRef, cellPortalListRef, cellDataListRef, portalContainerMapRef, headBandListRef, tailBandListRef, cradleActualRef, callbacksRef, }: {
    portalIDListRef: any;
    cellPortalListRef: any;
    cellDataListRef: any;
    portalContainerMapRef: any;
    headBandListRef: any;
    tailBandListRef: any;
    cradleActualRef: any;
    callbacksRef: any;
}) => ({ backwardCellsToRemoveCount, forwardCellsToRemoveCount, backwardBandsToRemoveCount, forwardBandsToRemoveCount, }: {
    backwardCellsToRemoveCount: any;
    forwardCellsToRemoveCount: any;
    backwardBandsToRemoveCount: any;
    forwardBandsToRemoveCount: any;
}) => void;
export default useRemoveCells;
