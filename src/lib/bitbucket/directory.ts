import { z } from "zod";
import type { Person, RepositoryConfig, RepositoryDirectory } from "../../types/domain";
import { BitbucketApiError, type BitbucketApiClient } from "./contracts";
import { normalizePerson } from "./normalizers";
import { readAllPages } from "./pagination";
import { mapConcurrent } from "../map-concurrent";

const userSchema = z.object({ uuid: z.string().min(1).optional(), account_id: z.string().min(1).optional(), display_name: z.string().optional(), nickname: z.string().optional() }).refine((user) => Boolean(user.uuid || user.account_id));
const memberSchema = z.object({ user: userSchema });
const uniquePeople = (people: Person[]) => [...new Map(people.map((person) => [person.accountId, person])).values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

function explain(error: unknown, workspace: string): string {
  if (error instanceof BitbucketApiError) {
    if (error.code === "unauthorized" || error.code === "forbidden") return `Bitbucket no autorizó el directorio de ${workspace}. Comprueba el permiso Read de Workspace (read:workspace:bitbucket) del token y tu acceso al workspace. Reconecta si cambias el token.`;
    if (error.code === "rate_limited") return `Bitbucket limitó las consultas de ${workspace}. Espera un momento y pulsa Actualizar personas.`;
    if (error.code === "network") return `No se pudo conectar con el directorio de ${workspace}. Revisa tu conexión y vuelve a intentarlo.`;
  }
  return `No se pudo leer el directorio de ${workspace}. Vuelve a intentarlo; mientras tanto solo se muestran personas descubiertas en PR.`;
}

export async function readTeamDirectory(client: BitbucketApiClient, repositories: RepositoryConfig[], signal?: AbortSignal): Promise<RepositoryDirectory[]> {
  const workspaces = new Map<string, Promise<Person[]>>();
  const workspaceMembers = (workspace: string) => {
    let pending = workspaces.get(workspace);
    if (!pending) {
      pending = readAllPages(client, `/workspaces/${encodeURIComponent(workspace)}/members?pagelen=100`, memberSchema, undefined, signal).then((members) => uniquePeople(members.map((member) => normalizePerson(member.user))));
      workspaces.set(workspace, pending);
    }
    return pending;
  };
  const configured = [...new Map(repositories.map((repo) => [`${repo.workspace}/${repo.slug}`, repo])).values()];
  return mapConcurrent(configured, 2, async (repository): Promise<RepositoryDirectory> => {
    signal?.throwIfAborted();
    try {
      const permissions = await readAllPages(client, `/workspaces/${encodeURIComponent(repository.workspace)}/permissions/repositories/${encodeURIComponent(repository.slug)}?pagelen=100`, memberSchema, undefined, signal);
      return { repository, source: "repository", people: uniquePeople(permissions.map((entry) => normalizePerson(entry.user))) };
    } catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof BitbucketApiError) || ![401, 403, 404].includes(error.status ?? 0)) return { repository, source: "unavailable", people: [], message: explain(error, repository.workspace) };
      try {
        const people = await workspaceMembers(repository.workspace);
        return { repository, source: "workspace", people, message: "Miembros del workspace. Bitbucket no permitió verificar sus accesos a este repositorio; esa consulta requiere administración del repositorio." };
      } catch (fallbackError) {
        signal?.throwIfAborted();
        return { repository, source: "unavailable", people: [], message: explain(fallbackError, repository.workspace) };
      }
    }
  });
}
