export const ACTIVITY_PAGE_SIZE = 50

export const ACTIVITY_FILTERS = [
    { key: "all", label: "All" },
    { key: "people", label: "People" },
    { key: "billing", label: "Billing" },
    { key: "transfers", label: "Transfers" },
]

const FILTER_TYPES = {
    people: [
        "invite_sent",
        "invite_revoked",
        "invite_accepted",
        "member_removed",
        "role_changed",
        "team_renamed",
    ],
    billing: ["seat_purchased", "seat_reduced"],
    transfers: ["transfer_created", "transfer_deleted"],
}

export function typesForFilter(filter) {
    return FILTER_TYPES[filter] || null
}
