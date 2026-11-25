package com.ngo.finance.funding.repository;

import com.ngo.finance.funding.entity.FundingChangeLog;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FundingChangeLogRepository extends JpaRepository<FundingChangeLog, Long> {

    /** In written order; the service groups rows by save and puts the newest save first. */
    List<FundingChangeLog> findByFundProfileIdOrderByIdAsc(Long fundProfileId);
}
