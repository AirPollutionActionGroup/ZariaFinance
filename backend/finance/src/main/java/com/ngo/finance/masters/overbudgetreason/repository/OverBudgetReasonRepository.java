package com.ngo.finance.masters.overbudgetreason.repository;

import com.ngo.finance.masters.overbudgetreason.entity.OverBudgetReason;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface OverBudgetReasonRepository extends JpaRepository<OverBudgetReason, Long> {

    boolean existsByNameIgnoreCase(String name);

    List<OverBudgetReason> findAllByOrderByNameAsc();

    List<OverBudgetReason> findByStatusTrueOrderByNameAsc();

    @Query("SELECT r FROM OverBudgetReason r WHERE LOWER(r.name) LIKE LOWER(CONCAT('%', :term, '%'))"
            + " OR LOWER(COALESCE(r.description, '')) LIKE LOWER(CONCAT('%', :term, '%')) ORDER BY r.name")
    List<OverBudgetReason> search(@Param("term") String term);

    /** How many debit notes use each reason: [reasonId, count]. */
    @Query("SELECT d.overBudgetReason.id, COUNT(d) FROM DebitNote d WHERE d.overBudgetReason IS NOT NULL GROUP BY d.overBudgetReason.id")
    List<Object[]> countDebitNotesByReason();
}
