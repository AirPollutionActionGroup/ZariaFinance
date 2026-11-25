package com.ngo.finance.donor.service;

import com.ngo.finance.donor.dto.request.ApproveGrantRequest;
import com.ngo.finance.donor.dto.request.CreateGrantRequest;
import com.ngo.finance.donor.dto.request.GrantRemarksRequest;
import com.ngo.finance.donor.dto.response.GrantDetailsResponse;
import com.ngo.finance.donor.dto.response.GrantListResponse;
import java.util.List;

/**
 * Service interface for Grant Agreement operations
 */
public interface GrantService {

    GrantDetailsResponse createGrant(CreateGrantRequest request);

    GrantDetailsResponse updateGrant(Long id, CreateGrantRequest request);

    GrantDetailsResponse getGrantById(Long id);

    GrantDetailsResponse getGrantByCode(String grantCode);

    /** The single grant agreement backed by this fund profile, if any (a profile backs at most one). */
    GrantDetailsResponse getGrantByFundProfileId(Long fundProfileId);

    List<GrantListResponse> getAllGrants();

    List<GrantListResponse> getGrantsByDonorId(Long donorId);

    List<GrantListResponse> searchGrants(String searchTerm);

    void approveGrant(Long id, ApproveGrantRequest request, String actor);

    void activateGrant(Long id, String actor);

    void closeGrant(Long id, String actor);

    void holdGrant(Long id, GrantRemarksRequest request, String actor);

    void resumeGrant(Long id, String actor);

    void completeGrant(Long id, String actor);
}
