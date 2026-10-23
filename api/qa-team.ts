import { createBlobQaTeamStore } from "../server/blob-qa-team-store.js";
import { createQaTeamHandler } from "../server/qa-team.js";

export const handler = createQaTeamHandler({ store: createBlobQaTeamStore() });

export default { fetch: handler };
