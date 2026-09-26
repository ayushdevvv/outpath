import re

_VAR_PATTERN = re.compile(r"\{\{\s*([\w.-]+)\s*\}\}")


class UnresolvedVariables(Exception):
    def __init__(self, names: list[str]):
        self.names = names
        super().__init__(f"Unresolved variables: {', '.join(names)}")


def resolve(value: str, variables: dict[str, str], missing: set[str]) -> str:
    def sub(match: re.Match) -> str:
        name = match.group(1)
        if name in variables:
            return variables[name]
        missing.add(name)
        return match.group(0)

    return _VAR_PATTERN.sub(sub, value or "")


def resolve_all(payload: dict, variables: dict[str, str]) -> tuple[dict, list[str]]:
    missing: set[str] = set()

    def walk(node):
        if isinstance(node, str):
            return resolve(node, variables, missing)
        if isinstance(node, list):
            return [walk(v) for v in node]
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items()}
        return node

    resolved = walk(payload)
    return resolved, sorted(missing)
