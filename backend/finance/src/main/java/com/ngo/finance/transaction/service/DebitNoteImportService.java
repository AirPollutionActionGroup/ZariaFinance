package com.ngo.finance.transaction.service;

import com.ngo.finance.masters.overbudgetreason.entity.OverBudgetReason;
import com.ngo.finance.masters.overbudgetreason.service.OverBudgetReasonService;
import static com.ngo.finance.transaction.service.ImportSupport.*;

import com.ngo.finance.bankDetails.entity.BankDetail;
import com.ngo.finance.bankDetails.repository.BankDetailRepository;
import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.exception.ResourceNotFoundException;
import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.donor.FundingClassifier;
import com.ngo.finance.donor.entity.DonorFundProfile;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.repository.DonorFundProfileRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.donor.repository.GrantRepository;
import com.ngo.finance.employee.EmployeeStatuses;
import com.ngo.finance.employee.entity.Employee;
import com.ngo.finance.employee.repository.EmployeeRepository;
import com.ngo.finance.outflow.dto.RefDto;
import com.ngo.finance.outflow.service.OutflowScheduleService;
import com.ngo.finance.outflow.service.OutflowScheduleService.OutflowRow;
import com.ngo.finance.paymentMode.entity.PaymentMode;
import com.ngo.finance.paymentMode.repository.PaymentModeRepository;
import com.ngo.finance.paymentType.group.entity.PaymentTypeGroup;
import com.ngo.finance.paymentType.group.repository.PaymentTypeGroupRepository;
import com.ngo.finance.paymentType.ledger.entity.PaymentTypeLedger;
import com.ngo.finance.paymentType.ledger.repository.PaymentTypeLedgerRepository;
import com.ngo.finance.transaction.dto.request.CreateDebitNoteRequest;
import com.ngo.finance.transaction.dto.request.DebitNoteImportRequest;
import com.ngo.finance.transaction.dto.request.DebitNoteImportRequest.Row;
import com.ngo.finance.transaction.dto.response.CreditNoteImportResponse.Status;
import com.ngo.finance.transaction.dto.response.DebitNoteImportResponse;
import com.ngo.finance.transaction.dto.response.DebitNoteImportResponse.RowResult;
import com.ngo.finance.transaction.dto.response.NoteResponse;
import com.ngo.finance.transaction.entity.DebitNote;
import com.ngo.finance.transaction.repository.DebitNoteRepository;
import com.ngo.finance.vendorRegister.entity.VendorRegister;
import com.ngo.finance.vendorRegister.repository.VendorRegisterRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Debit notes from a CSV file. Every row is checked the way the New Debit Note
 * form checks it — outflow row, payee, payment mode, group ▸ ledger, donor ▸
 * fund — and reported per row. Valid rows are saved through DebitNoteService,
 * in one transaction.
 *
 * Rows earlier in the file count: two rows on the same outflow row are added
 * together for the budget (an over-budget row needs a reason), and two rows on
 * the same fund for its available balance — so what the import reports is what
 * saving the notes in file order will find. A Tally voucher already on a debit
 * note, or twice in the file, is an error; same date + amount + reference is a
 * possible duplicate, saved only when the user ticks it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DebitNoteImportService {


    private static final Set<String> PAYABLE_EMPLOYEE = Set.of(EmployeeStatuses.ACTIVE, EmployeeStatuses.ON_NOTICE);

    private final DebitNoteService debitNoteService;
    private final DebitNoteRepository debitNoteRepository;
    private final OutflowScheduleService outflowScheduleService;
    private final FundBalanceService fundBalanceService;
    private final PaymentModeRepository paymentModeRepository;
    private final BankDetailRepository bankDetailRepository;
    private final PaymentTypeGroupRepository groupRepository;
    private final PaymentTypeLedgerRepository ledgerRepository;
    private final EmployeeRepository employeeRepository;
    private final VendorRegisterRepository vendorRepository;
    private final DonorRepository donorRepository;
    private final DonorFundProfileRepository fundProfileRepository;
    private final GrantRepository grantRepository;
    private final OverBudgetReasonService overBudgetReasonService;

    /** Masters read once per import, and the running totals of the rows taken so far. */
    private final class Context {
        final List<PaymentMode> paymentModes = paymentModeRepository.findAll().stream()
                .filter(m -> !Boolean.FALSE.equals(m.getStatus())).toList();
        final List<BankDetail> bankAccounts = bankDetailRepository.findAll().stream()
                .filter(b -> !Boolean.FALSE.equals(b.getStatus())).toList();
        final List<PaymentTypeGroup> groups = groupRepository.findAll().stream()
                .filter(g -> !Boolean.FALSE.equals(g.getStatus())).toList();
        final List<PaymentTypeLedger> ledgers = ledgerRepository.findAll().stream()
                .filter(l -> !Boolean.FALSE.equals(l.getStatus())).toList();
        final List<Employee> employees = employeeRepository.findAll();
        final List<VendorRegister> vendors = vendorRepository.findAll();
        /** Outflow row id → spent by rows already taken from this file. */
        final Map<String, BigDecimal> spentInFile = new HashMap<>();
        /** Fund profile id → debited by rows already taken from this file. */
        final Map<String, BigDecimal> debitedInFile = new HashMap<>();
    }

    /** A row checked against the data: the request it becomes (when valid) and what to report. */
    private record Checked(RowResult result, CreateDebitNoteRequest request, String rowId) {
    }

    @Transactional
    public DebitNoteImportResponse importNotes(DebitNoteImportRequest request) {
        Context ctx = new Context();
        Set<Integer> selected = request.isDryRun() || request.getSelected() == null ? null : new HashSet<>(request.getSelected());

        List<Checked> checked = new ArrayList<>();
        Set<String> seenInFile = new HashSet<>();
        Map<String, Integer> tallyInFile = new HashMap<>();
        for (Row row : request.getRows()) {
            Checked c = check(row, request.getActor(), ctx);
            RowResult r = c.result();

            // One Tally voucher → one debit note: already imported, or twice in this file, is an error.
            String tallyNo = trimOrNull(row.getTallyVoucherNo());
            if (tallyNo != null) {
                String tallyType = blank(row.getTallyVoucherType()) ? "" : row.getTallyVoucherType().trim();
                String label = CreditNoteService.tallyLabel(tallyType, tallyNo);
                Integer earlier = tallyInFile.putIfAbsent((tallyType + "|" + tallyNo).toUpperCase(Locale.ROOT), row.getRowNumber());
                debitNoteRepository.findByTallyVoucher(tallyType, tallyNo).ifPresentOrElse(
                        existing -> r.getErrors().add("Tally voucher " + label + " is already imported as " + existing.getNoteCode()),
                        () -> {
                            if (earlier != null) {
                                r.getErrors().add("Tally voucher " + label + " is also on row " + earlier + " of this file");
                            }
                        });
            }

            if (c.request() != null && r.getErrors().isEmpty()) {
                CreateDebitNoteRequest note = c.request();
                boolean dupInFile = !seenInFile.add(duplicateKey(note.getDate(), note.getAmount(), note.getReference()));
                boolean dupExisting = existsAlready(note);
                if (dupInFile || dupExisting) {
                    r.setDuplicate(true);
                    r.getWarnings().add(dupExisting
                            ? "Possible duplicate: a debit note with this date, amount and reference already exists"
                            : "Possible duplicate: an earlier row in this file has the same date, amount and reference");
                }
            }
            r.setStatus(!r.getErrors().isEmpty() ? Status.ERROR : !r.getWarnings().isEmpty() ? Status.WARNING : Status.READY);

            // Rows that will be saved count towards the budget and fund totals of the rows after them.
            boolean taken = r.getStatus() != Status.ERROR
                    && (selected != null ? selected.contains(r.getRowNumber()) : !r.isDuplicate());
            if (taken) {
                ctx.spentInFile.merge(c.rowId(), c.request().getAmount(), BigDecimal::add);
                String fundRef = RefDto.idOf(c.request().getFundProfile());
                if (fundRef != null) {
                    ctx.debitedInFile.merge(fundRef, c.request().getAmount(), BigDecimal::add);
                }
            }
            checked.add(c);
        }

        int created = 0;
        if (!request.isDryRun()) {
            for (Checked c : checked) {
                RowResult r = c.result();
                if (r.getStatus() == Status.ERROR) {
                    continue;
                }
                boolean wanted = selected != null ? selected.contains(r.getRowNumber()) : !r.isDuplicate();
                if (!wanted) {
                    r.setStatus(Status.SKIPPED);
                    continue;
                }
                NoteResponse note = debitNoteService.createDebitNote(c.request());
                r.setNoteCode(note.getId());
                r.setStatus(Status.IMPORTED);
                created++;
            }
            log.info("Debit note import: {} of {} rows imported", created, checked.size());
        }

        return DebitNoteImportResponse.builder()
                .dryRun(request.isDryRun())
                .createdCount(created)
                .rows(checked.stream().map(Checked::result).toList())
                .build();
    }

    // ── One row ───────────────────────────────────────────────────────────────

    private Checked check(Row row, String actor, Context ctx) {
        RowResult result = RowResult.builder().rowNumber(row.getRowNumber()).build();
        List<String> errors = result.getErrors();

        result.setTallyVoucher(checkTallyVoucher(row.getTallyVoucherType(), row.getTallyVoucherNo(), errors));
        java.time.LocalDate date = parseDate(row.getDate(), errors);

        // Outflow row — its book is the note's book unless the file says otherwise.
        OutflowRow line = null;
        if (blank(row.getOutflowLineId())) {
            errors.add("outflow_line_id is required, e.g. BUD-2026-001-BL01-Q2");
        } else {
            try {
                line = outflowScheduleService.resolve(row.getOutflowLineId().trim().toUpperCase(Locale.ROOT));
                result.setOutflowLineId(line.id());
                result.setLineName(line.line().getDescription());
            } catch (ResourceNotFoundException | ValidationException e) {
                errors.add("outflow_line_id: " + e.getMessage());
            }
        }
        ContributionType book = blank(row.getBook())
                ? (line != null ? line.line().getBook() : parseBook(row.getBook(), errors))
                : parseBook(row.getBook(), errors);

        BigDecimal amount = null;
        if (blank(row.getAmountInr())) {
            errors.add("amount_inr is required");
        } else {
            amount = parseAmount("amount_inr", row.getAmountInr(), errors);
        }

        // Payee
        String category = null;
        RefDto payee = null;
        if (blank(row.getPayeeCategory())) {
            errors.add("payee_category is required (Employee or Vendor)");
        } else {
            category = row.getPayeeCategory().trim().toUpperCase(Locale.ROOT);
            if (!category.equals("EMPLOYEE") && !category.equals("VENDOR")) {
                errors.add("payee_category \"" + row.getPayeeCategory().trim() + "\" must be Employee or Vendor");
                category = null;
            } else {
                result.setPayeeCategory(category.equals("EMPLOYEE") ? "Employee" : "Vendor");
            }
        }
        if (blank(row.getPayeeCode())) {
            errors.add("payee_code is required — the employee ID or vendor code");
        } else if (category != null) {
            payee = matchPayee(category, row.getPayeeCode().trim(), ctx, errors);
            if (payee != null) {
                result.setPayeeName(payee.getName());
            }
        }

        // Payment mode, bank account, group ▸ ledger
        PaymentMode mode = null;
        if (blank(row.getPaidVia())) {
            errors.add("paid_via is required (a payment mode, e.g. NEFT)");
        } else {
            mode = ctx.paymentModes.stream().filter(m -> m.getName().equalsIgnoreCase(row.getPaidVia().trim()))
                    .findFirst().orElse(null);
            if (mode == null) {
                errors.add("paid_via \"" + row.getPaidVia().trim() + "\" is not an active payment mode");
            } else {
                result.setPaidVia(mode.getName());
            }
        }
        BankDetail bank = blank(row.getBankAccount()) ? null : matchBank(row.getBankAccount(), book, ctx.bankAccounts, errors);

        PaymentTypeGroup group = null;
        if (blank(row.getPaymentGroup())) {
            errors.add("payment_group is required (a payment group name)");
        } else {
            group = ctx.groups.stream().filter(g -> g.getName().equalsIgnoreCase(row.getPaymentGroup().trim()))
                    .findFirst().orElse(null);
            if (group == null) {
                errors.add("payment_group \"" + row.getPaymentGroup().trim() + "\" is not an active payment group");
            }
        }
        PaymentTypeLedger ledger = null;
        if (!blank(row.getLedger()) && group != null) {
            Long groupId = group.getId();
            ledger = ctx.ledgers.stream()
                    .filter(l -> Objects.equals(l.getGroupId(), groupId) && l.getName().equalsIgnoreCase(row.getLedger().trim()))
                    .findFirst().orElse(null);
            if (ledger == null) {
                errors.add("ledger \"" + row.getLedger().trim() + "\" is not an active ledger under " + group.getName());
            }
        }

        // Donor → fund profile (optional; a fund needs its donor, and both on the note's book)
        DonorMaster donor = null;
        if (!blank(row.getDonorCode())) {
            donor = donorRepository.findByDonorCode(row.getDonorCode().trim()).orElse(null);
            if (donor == null) {
                errors.add("donor_code " + row.getDonorCode().trim() + " not found");
            }
        }
        DonorFundProfile fund = null;
        if (!blank(row.getFundProfileCode())) {
            fund = fundProfileRepository.findByProfileCode(row.getFundProfileCode().trim().toUpperCase(Locale.ROOT)).orElse(null);
            if (fund == null) {
                errors.add("fund_profile_code " + row.getFundProfileCode().trim() + " not found");
            } else if (donor != null && !Objects.equals(fund.getDonor().getId(), donor.getId())) {
                errors.add("fund_profile_code " + fund.getProfileCode() + " belongs to "
                        + fund.getDonor().getDonorName() + ", not " + donor.getDonorName());
            } else if (donor == null && blank(row.getDonorCode())) {
                donor = fund.getDonor(); // the fund names its donor
            }
        } else if (donor != null) {
            errors.add("fund_profile_code is required when a donor is given");
        }
        if (donor != null && book != null && FundingClassifier.bookOf(donor) != book) {
            errors.add("Donor " + donor.getDonorName() + " is on the " + FundingClassifier.bookOf(donor).getShortName()
                    + " book, not " + book.getShortName());
        }
        if (donor != null) {
            result.setDonorName(donor.getDonorName());
        }
        if (fund != null) {
            result.setFundProfileCode(fund.getProfileCode());
        }

        result.setDate(date);
        result.setBook(book != null ? book.getShortName() : null);
        result.setAmount(amount);

        // Budget: over budget (counting earlier rows of this file) needs a reason.
        OverBudgetReason reason = null;
        if (line != null && amount != null) {
            BigDecimal remainingAfter = line.expectedAmount()
                    .subtract(outflowScheduleService.spentOn(line))
                    .subtract(ctx.spentInFile.getOrDefault(line.id(), BigDecimal.ZERO))
                    .subtract(amount);
            if (remainingAfter.signum() < 0) {
                String over = "takes " + line.id() + " over budget by " + inr(remainingAfter.negate());
                String choices = String.join(", ", overBudgetReasonService.activeNames());
                if (blank(row.getReason())) {
                    errors.add("reason is required — this note " + over + " (" + choices + ")");
                } else {
                    // By name (Masters → Over-budget reasons), ignoring case, spaces and punctuation.
                    reason = overBudgetReasonService.findActiveByName(row.getReason()).orElse(null);
                    if (reason == null) {
                        errors.add("reason \"" + row.getReason().trim() + "\" must be one of: " + choices);
                    } else {
                        result.getWarnings().add("This note " + over + " — reason: " + reason.getName());
                    }
                }
            }
        }

        // Fund: can't debit more than it has available (counting earlier rows of this file).
        if (fund != null && amount != null) {
            String fundRef = String.valueOf(fund.getId());
            BigDecimal available = fundBalanceService.balanceOf(fundRef).available()
                    .subtract(ctx.debitedInFile.getOrDefault(fundRef, BigDecimal.ZERO));
            if (amount.compareTo(available) > 0) {
                boolean earlierRows = ctx.debitedInFile.containsKey(fundRef);
                errors.add(available.signum() > 0
                        ? "Only " + inr(available) + " is available on " + fund.getProfileCode()
                                + (earlierRows ? " after the earlier rows of this file" : "") + " — the debit can't be more than that"
                        : fund.getProfileCode() + " has no balance available"
                                + (earlierRows ? " after the earlier rows of this file" : " — nothing received into it yet, or it's fully used"));
            }
        }

        if (!errors.isEmpty()) {
            return new Checked(result, null, line != null ? line.id() : null);
        }

        String remarks = blank(row.getRemarks()) ? "Imported from CSV" : row.getRemarks().trim() + " (imported from CSV)";
        DonorFundProfile fundFinal = fund;
        CreateDebitNoteRequest note = CreateDebitNoteRequest.builder()
                .outflowLineId(line.id())
                .date(date)
                .amount(amount)
                .overBudgetReasonId(reason != null ? reason.getId() : null)
                .book(book)
                .payeeCategory(category)
                .payee(payee)
                .paymentMode(RefDto.of(String.valueOf(mode.getId()), mode.getName()))
                .bankAccount(bank == null ? null : RefDto.of(String.valueOf(bank.getId()), bankLabel(bank)))
                .group(RefDto.of(String.valueOf(group.getId()), group.getName()))
                .ledger(ledger == null ? null : RefDto.of(String.valueOf(ledger.getId()), ledger.getName()))
                .donor(donor == null ? null : RefDto.of(String.valueOf(donor.getId()), donor.getDonorName()))
                .fundProfile(fund == null ? null : RefDto.of(String.valueOf(fund.getId()), fundLabel(fund)))
                .grant(fund == null ? null : grantRepository.findByFundProfileId(fundFinal.getId()).stream().findFirst()
                        .map(g -> RefDto.of(String.valueOf(g.getId()), g.getGrantCode())).orElse(null))
                .reference(trimOrNull(row.getReference()))
                .tallyVoucherType(trimOrNull(row.getTallyVoucherType()))
                .tallyVoucherNo(trimOrNull(row.getTallyVoucherNo()))
                .remarks(remarks)
                .actor(actor)
                .build();
        return new Checked(result, note, line.id());
    }

    // ── Matching ──────────────────────────────────────────────────────────────

    /** Employee by employee ID (Active or On Notice), vendor by vendor code (active). Snapshots match the form. */
    private RefDto matchPayee(String category, String code, Context ctx, List<String> errors) {
        if (category.equals("EMPLOYEE")) {
            Employee e = ctx.employees.stream().filter(x -> code.equalsIgnoreCase(x.getEmpId())).findFirst().orElse(null);
            if (e == null) {
                errors.add("payee_code " + code + " is not an employee ID");
                return null;
            }
            if (!PAYABLE_EMPLOYEE.contains(e.getStatus())) {
                errors.add("Employee " + e.getName() + " (" + e.getEmpId() + ") is " + e.getStatus() + " — can't be paid");
                return null;
            }
            return RefDto.of(String.valueOf(e.getId()), e.getName());
        }
        VendorRegister v = ctx.vendors.stream().filter(x -> code.equalsIgnoreCase(x.getVendorCode())).findFirst().orElse(null);
        if (v == null) {
            errors.add("payee_code " + code + " is not a vendor code");
            return null;
        }
        if (Boolean.FALSE.equals(v.getStatus())) {
            errors.add("Vendor " + v.getLegalName() + " (" + v.getVendorCode() + ") is inactive");
            return null;
        }
        return RefDto.of(String.valueOf(v.getId()), v.getLegalName());
    }


    private boolean existsAlready(CreateDebitNoteRequest note) {
        String ref = norm(note.getReference());
        for (DebitNote existing : debitNoteRepository.findByNoteDateAndAmount(note.getDate(), note.getAmount())) {
            if (norm(existing.getReference()).equals(ref)) {
                return true;
            }
        }
        return false;
    }
}
