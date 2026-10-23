export function MentionText({ text, names }: { text: string; names: Record<string, string> }) {
  return <>{text.split(/(@\{[^{}\s]+\})/g).map((part, index) => {
    const id = part.match(/^@\{([^{}\s]+)\}$/)?.[1];
    const name = id && Object.hasOwn(names, id) ? names[id] : undefined;
    return id ? <span className="comment-mention" key={index} title={name ? undefined : "El nombre de esta mención no está disponible"}>@{name ?? "Usuario de Bitbucket"}</span> : part;
  })}</>;
}
