package com.ngo.finance.masters.documenttype.repository;

import com.ngo.finance.masters.documenttype.entity.DocumentTypeMaster;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DocumentTypeMasterRepository extends JpaRepository<DocumentTypeMaster, Long> {

    boolean existsByNameIgnoreCase(String name);

    List<DocumentTypeMaster> findAllByOrderByNameAsc();

    List<DocumentTypeMaster> findByStatusTrueOrderByNameAsc();

    /** Active document types a donor type must give. */
    @Query("SELECT d FROM DocumentTypeMaster d JOIN d.requiredForDonorTypeIds t"
            + " WHERE t = :donorTypeId AND d.status = true ORDER BY d.name")
    List<DocumentTypeMaster> findActiveRequiredFor(@Param("donorTypeId") Long donorTypeId);

    @Query("SELECT d FROM DocumentTypeMaster d WHERE LOWER(d.name) LIKE LOWER(CONCAT('%', :term, '%')) ORDER BY d.name")
    List<DocumentTypeMaster> search(@Param("term") String term);
}
