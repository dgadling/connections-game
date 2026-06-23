"""Generate valid round-robin groups for N members.

Each group is a derangement (no fixed points) with NO 2-cycles (no mutual pairs).
Across all N-1 groups, every directed pair appears exactly once.

For odd N: additive construction (i → (i+k) mod N) gives single N-cycles.
For even N: backtracking search — additive fails because distance-N/2
pairs always form mutual pairs that can't coexist in one group.
For N=4: impossible to fully avoid 2-cycles; one group will have them.
"""

from __future__ import annotations


def generate_groups(member_ids: list[int]) -> list[list[tuple[int, int]]]:
    """Return N-1 groups of (asker_id, target_id) pairings for N members."""
    n = len(member_ids)
    if n < 3:
        raise ValueError("Need at least 3 members")

    if n % 2 == 1:
        perms = _additive(n)
    else:
        perms = _backtrack_search(n)

    return [
        [(member_ids[i], member_ids[p[i]]) for i in range(n)]
        for p in perms
    ]


def _additive(n: int) -> list[list[int]]:
    """Additive construction for odd N. All permutations are single N-cycles."""
    perms = []
    for k in range(1, n):
        perms.append([(i + k) % n for i in range(n)])
    return perms


def _backtrack_search(n: int) -> list[list[int]]:
    """Backtracking search for even N. Finds N-1 derangements without 2-cycles."""
    used: set[tuple[int, int]] = set()
    result: list[list[int]] = []

    for _ in range(n - 1):
        perm = _find_derangement(n, used, allow_2cycles=False)
        if perm is None:
            # N=4: impossible without 2-cycles. Allow them for this group.
            perm = _find_derangement(n, used, allow_2cycles=True)
        if perm is None:
            raise RuntimeError(f"Failed to generate groups for {n} members")
        result.append(perm)
        for i in range(n):
            used.add((i, perm[i]))

    return result


def _find_derangement(
    n: int, used: set[tuple[int, int]], allow_2cycles: bool
) -> list[int] | None:
    """Find a derangement of [0..n-1] using only unused pairs, no 2-cycles."""
    perm = [-1] * n
    taken: list[bool] = [False] * n

    def backtrack(i: int) -> bool:
        if i == n:
            return True
        for j in range(n):
            if j == i or taken[j] or (i, j) in used:
                continue
            if not allow_2cycles and perm[j] == i:
                continue
            perm[i] = j
            taken[j] = True
            if backtrack(i + 1):
                return True
            taken[j] = False
            perm[i] = -1
        return False

    return list(perm) if backtrack(0) else None
