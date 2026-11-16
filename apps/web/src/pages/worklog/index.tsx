import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import WorkLogView from "~/views/worklog";

const WorkLogPage: NextPageWithLayout = () => {
  return (
    <>
      <WorkLogView />
      <Popup />
    </>
  );
};

WorkLogPage.getLayout = (page) => getDashboardLayout(page);

export default WorkLogPage;
