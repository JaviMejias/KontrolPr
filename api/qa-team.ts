import { createBlobQaTeamStore } from "../server/blob-qa-team-store";
import { createQaTeamHandler } from "../server/qa-team";

export const handler = createQaTeamHandler({ store: createBlobQaTeamStore() });

export default { fetch: handler };
