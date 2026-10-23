import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { extractMentionNames, mentionNamesFor } from "./mentions";
import { normalizePerson, normalizePullRequestComment } from "./normalizers";
import { MentionText } from "../../components/ui/MentionText";

afterEach(cleanup);
describe("Bitbucket mentions", () => {
  it("keeps the stable UUID and the separate Atlassian account alias", () => {
    const person = normalizePerson({ uuid: "{uuid-jm}", account_id: "5ffcaf3c8332a1010e2170db", display_name: "Javier Mejías" });
    expect(person.accountId).toBe("{uuid-jm}");
    expect(mentionNamesFor([person])["5ffcaf3c8332a1010e2170db"]).toBe("Javier Mejías");
  });
  it("extracts rendered mention names without inserting remote HTML", () => {
    const comment = normalizePullRequestComment({ id: 1, content: { raw: "@{aid-jm} subi los cambios", html: '<p><a data-account-id="aid-jm">@Javier Mejías</a> subi los cambios<img src="x" onerror="alert(1)"></p>' } });
    render(<p><MentionText text={comment.content} names={comment.mentions ?? {}} /></p>);
    expect(screen.getByText("@Javier Mejías")).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
    expect(document.body).not.toHaveTextContent("@{aid-jm}");
    expect(comment.content).toBe("@{aid-jm} subi los cambios");
  });
  it("handles encoded UUID links and ordered mention anchors", () => {
    expect(extractMentionNames("@{uuid-jm}", '<a href="https://bitbucket.org/%7Buuid-jm%7D/">Javier Mejías</a>')["uuid-jm"]).toBe("Javier Mejías");
    expect(extractMentionNames("@{account-jm} @{account-dc}", '<a class="mention" href="/uuid1/">Javier Mejías</a><a class="mention" href="/uuid2/">Diego Cuevas</a>')).toEqual({ "account-jm": "Javier Mejías", "account-dc": "Diego Cuevas" });
  });
  it("does not invent a name from unrelated links or expose unresolved account IDs", () => {
    expect(extractMentionNames("@{missing}", '<a href="https://example.com/missing">Unrelated</a>')).toEqual({});
    render(<MentionText text="@{missing} hola <script>unsafe</script> @{constructor}" names={{}} />);
    expect(screen.getAllByText("@Usuario de Bitbucket")).toHaveLength(2);
    expect(document.querySelector("script")).toBeNull();
  });
});
