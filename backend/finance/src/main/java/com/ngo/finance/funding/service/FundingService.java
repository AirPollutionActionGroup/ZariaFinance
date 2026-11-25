package com.ngo.finance.funding.service;

import com.ngo.finance.funding.dto.FundingListItem;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.funding.dto.FundingResponse;
import com.ngo.finance.funding.dto.FundingStage;
import java.util.List;

/**
 * Funding = a fund profile (the terms) and the grant agreement signed on it,
 * handled as one record. Both are still stored in their own tables; this layer
 * saves them together and reads them back together.
 */
public interface FundingService {

    /** Creates the terms and (if given) the agreement in one transaction. */
    FundingResponse create(FundingRequest request);

    /** Updates the terms and creates or updates the agreement, in one transaction. */
    FundingResponse update(Long profileId, FundingRequest request);

    FundingResponse get(Long profileId);

    /** Every funding record, newest first; both filters optional. */
    List<FundingListItem> list(Long donorId, FundingStage stage);
}
