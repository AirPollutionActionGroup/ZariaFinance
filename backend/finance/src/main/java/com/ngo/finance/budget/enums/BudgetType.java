package com.ngo.finance.budget.enums;

/**
 * What a budget is planned for: a single programme, a single project (a
 * programme row with type Project), or the organisation as a whole
 * (overheads, admin, shared costs).
 */
public enum BudgetType {
    PROGRAMME,
    PROJECT,
    ORGANISATION;

    /** Programme and Project budgets are tied to one programme row; Organisation ones to none. */
    public boolean needsProgramme() {
        return this != ORGANISATION;
    }
}
