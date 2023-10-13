const initialStudioStoreState = {
  lastHistory: null,
  modelSaveStatus: null,
  openedParallelBranch: {},
};

const useStudioStore = (setState, getState) => ({
  ...initialStudioStoreState,
  resetStore: () => {
    setState(() => initialStudioStoreState);
  },
});
