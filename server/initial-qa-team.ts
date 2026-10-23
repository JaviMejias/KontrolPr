import { qaTeamMembersSchema } from "../src/lib/team/contracts.js";

export const soleQaEditorId = "{04fdd9ab-e88f-4f82-a6d0-381c527c470a}";
export const initialQaTeam = qaTeamMembersSchema.parse([
  { accountId: soleQaEditorId, uuid: soleQaEditorId, displayName: "Javier Mejías", nickname: "Javier Mejías", atlassianAccountId: "5ffcaf3c8332a1010e2170db" },
  { accountId: "{9fab616a-dca5-4816-bd43-c53c5ae1a1e7}", uuid: "{9fab616a-dca5-4816-bd43-c53c5ae1a1e7}", displayName: "Diego Gustavo Cuevas Montes", nickname: "Diego Gustavo Cuevas Montes", atlassianAccountId: "712020:723685b5-9423-45cd-aaa0-91cfc37960e2" },
  { accountId: "{e8c0b834-0d12-4baa-bfcc-9e1c4c30e24c}", uuid: "{e8c0b834-0d12-4baa-bfcc-9e1c4c30e24c}", displayName: "Iván Reyes", nickname: "Iván Reyes", atlassianAccountId: "612583d40bbbf90071f031ac" },
]);
