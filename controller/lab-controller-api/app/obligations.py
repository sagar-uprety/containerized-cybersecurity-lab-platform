"""Shared derivation of AssignmentObligation ids.

Both `repository._labs_detail` (what a student sees) and
`feedback.sync_assignment_obligations` (what actually gets persisted) must agree
on the id for a given (group_lab, user) pair, or a session/check recorded against
the id the student saw would not line up with the obligation row that exists.
A standalone module keeps that single fact out of both repository.py and
feedback.py so neither has to import the other just for this.
"""

import uuid

_OBLIGATION_NAMESPACE = uuid.UUID("74162d83-7f33-4d1b-a330-5084787ed3aa")


def obligation_id(group_lab_id: int, user_id: int) -> str:
    return str(uuid.uuid5(_OBLIGATION_NAMESPACE, f"{group_lab_id}:{user_id}"))
