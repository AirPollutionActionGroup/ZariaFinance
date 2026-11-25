package com.ngo.finance.transaction.service;

import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.exception.ValidationException;
import java.math.BigDecimal;
import com.ngo.finance.common.exception.ResourceNotFoundException;
import com.ngo.finance.outflow.dto.RefDto;
import com.ngo.finance.transaction.dto.request.CreateCreditNoteRequest;
import com.ngo.finance.transaction.dto.response.NoteResponse;
import com.ngo.finance.transaction.entity.CreditNote;
import com.ngo.finance.transaction.mapper.NoteMapper;
import com.ngo.finance.transaction.repository.CreditNoteRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Credit notes: money that came back, optionally returned to a donor fund.
 * They aren't tied to an outflow row or a debit note, so they don't change Spent.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class CreditNoteService {

    private final CreditNoteRepository creditNoteRepository;

    private final NoteMapper noteMapper;

    @Transactional(readOnly = true)
    public List<NoteResponse> listCreditNotes() {
        return creditNoteRepository.findAllByOrderByNoteDateDescIdDesc().stream().map(noteMapper::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public NoteResponse getCreditNote(String code) {
        return noteMapper.toResponse(findOrThrow(code));
    }

    public NoteResponse createCreditNote(CreateCreditNoteRequest request) {
        NoteRules.requirePicked(request.getPaymentMode(), "Select how the money was received");
        NoteRules.requireDonorForFund(request.getDonor(), request.getFundProfile());
        boolean hasFund = RefDto.nameOf(request.getFundProfile()) != null;
        String currency = validateForeignAmount(request);
        String tallyType = NoteRules.trimToNull(request.getTallyVoucherType());
        String tallyNo = NoteRules.trimToNull(request.getTallyVoucherNo());
        validateTallyVoucher(tallyType, tallyNo);

        String actor = NoteRules.actor(request.getActor());
        CreditNote note = CreditNote.builder()
                .noteCode(nextCode(request.getDate().getYear()))
                .noteDate(request.getDate())
                .amount(request.getAmount())
                .book(request.getBook())
                .paymentModeRef(RefDto.idOf(request.getPaymentMode()))
                .paymentModeName(RefDto.nameOf(request.getPaymentMode()))
                .bankAccountRef(RefDto.idOf(request.getBankAccount()))
                .bankAccountName(RefDto.nameOf(request.getBankAccount()))
                .groupRef(RefDto.idOf(request.getGroup()))
                .groupName(RefDto.nameOf(request.getGroup()))
                .ledgerRef(RefDto.idOf(request.getLedger()))
                .ledgerName(RefDto.nameOf(request.getLedger()))
                .donorRef(RefDto.idOf(request.getDonor()))
                .donorName(RefDto.nameOf(request.getDonor()))
                .fundProfileRef(RefDto.idOf(request.getFundProfile()))
                .fundProfileName(RefDto.nameOf(request.getFundProfile()))
                .grantRef(RefDto.idOf(request.getGrant()))
                .grantName(RefDto.nameOf(request.getGrant()))
                // Disbursement rule and tranche only make sense with a fund.
                .disbursementType(hasFund ? NoteRules.trimToNull(request.getDisbursementType()) : null)
                .trancheRef(hasFund ? RefDto.idOf(request.getTranche()) : null)
                .trancheName(hasFund ? RefDto.nameOf(request.getTranche()) : null)
                .reference(NoteRules.trimToNull(request.getReference()))
                .tallyVoucherType(tallyType)
                .tallyVoucherNo(tallyNo)
                .remarks(NoteRules.trimToNull(request.getRemarks()))
                .attachmentName(NoteRules.trimToNull(request.getAttachmentName()))
                .currency(currency)
                .foreignAmount(currency != null ? request.getForeignAmount() : null)
                .fxRate(currency != null ? request.getFxRate() : null)
                .build();
        note.setCreatedBy(actor);
        note.setUpdatedBy(actor);

        CreditNote saved = creditNoteRepository.save(note);
        log.info("Credit note {} issued for {}", saved.getNoteCode(), saved.getAmount());
        return noteMapper.toResponse(saved);
    }

    /** A Tally voucher type needs its number, and one Tally voucher goes on one credit note. */
    private void validateTallyVoucher(String type, String no) {
        if (no == null) {
            if (type != null) {
                throw new ValidationException("Validation failed for one or more fields",
                        java.util.Map.of("tallyVoucherNo", "Enter the Tally voucher number"));
            }
            return;
        }
        creditNoteRepository.findByTallyVoucher(type == null ? "" : type, no).ifPresent(existing -> {
            throw new ValidationException("Validation failed for one or more fields",
                    java.util.Map.of("tallyVoucherNo", "Tally voucher " + tallyLabel(type, no) + " is already on " + existing.getNoteCode()));
        });
    }

    /** "Receipt 245", or just "245" without a type. */
    public static String tallyLabel(String type, String no) {
        return type == null || type.isBlank() ? no : type.trim() + " " + no;
    }

    /**
     * The FC side of a receipt: currency, foreign amount and rate come together,
     * only on the FC book, and the INR amount must be foreign amount × rate
     * (±₹1 for rounding). Returns the normalised currency, or null for INR.
     */
    private String validateForeignAmount(CreateCreditNoteRequest request) {
        boolean any = request.getCurrency() != null || request.getForeignAmount() != null || request.getFxRate() != null;
        if (!any) {
            return null;
        }
        java.util.Map<String, String> errors = new java.util.LinkedHashMap<>();
        String currency = request.getCurrency() == null ? null : request.getCurrency().trim().toUpperCase();
        if (request.getBook() != ContributionType.FC) {
            errors.put("currency", "A foreign-currency amount is only for credit notes on the FC book");
        }
        if (currency == null || !currency.matches("[A-Z]{3}") || "INR".equals(currency)) {
            errors.put("currency", "Currency must be a 3-letter foreign currency code, e.g. USD");
        }
        if (request.getForeignAmount() == null || request.getForeignAmount().signum() <= 0) {
            errors.put("foreignAmount", "Amount in the foreign currency must be greater than 0");
        }
        if (request.getFxRate() == null || request.getFxRate().signum() <= 0) {
            errors.put("fxRate", "FX rate must be greater than 0");
        }
        if (errors.isEmpty() && request.getAmount() != null) {
            BigDecimal expected = request.getForeignAmount().multiply(request.getFxRate());
            if (expected.subtract(request.getAmount()).abs().compareTo(BigDecimal.ONE) > 0) {
                errors.put("amount", "Amount must equal " + request.getForeignAmount().toPlainString() + " " + currency
                        + " × " + request.getFxRate().toPlainString() + " = "
                        + expected.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
            }
        }
        if (!errors.isEmpty()) {
            throw new ValidationException("Validation failed for one or more fields", errors);
        }
        return currency;
    }

    private CreditNote findOrThrow(String code) {
        return creditNoteRepository.findByNoteCode(code)
                .orElseThrow(() -> new ResourceNotFoundException("Credit note " + code + " not found"));
    }

    /** CN-{year}-{nnn}, one sequence per calendar year of the note date. */
    private String nextCode(int year) {
        String prefix = "CN-" + year + "-";
        int next = creditNoteRepository.findTopByNoteCodeStartingWithOrderByNoteCodeDesc(prefix)
                .map(n -> Integer.parseInt(n.getNoteCode().substring(prefix.length())) + 1)
                .orElse(1);
        return prefix + String.format("%03d", next);
    }
}
