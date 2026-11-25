package com.ngo.finance.transaction.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.budget.dto.request.BudgetLineRequest;
import com.ngo.finance.budget.dto.request.SaveBudgetRequest;
import com.ngo.finance.budget.enums.BudgetType;
import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.DisbursementRuleItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.ReleaseCriterionItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.TrancheCriterionItem;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.enums.CriterionType;
import com.ngo.finance.donor.enums.DisbursementType;
import com.ngo.finance.donor.enums.FundClass;
import com.ngo.finance.donor.enums.FundMode;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.employee.repository.EmployeeRepository;
import com.ngo.finance.financialYear.entity.FinancialYear;
import com.ngo.finance.financialYear.repository.FinancialYearRepository;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import com.ngo.finance.outflow.dto.RefDto;
import com.ngo.finance.paymentMode.repository.PaymentModeRepository;
import com.ngo.finance.paymentType.group.entity.PaymentTypeGroup;
import com.ngo.finance.paymentType.group.repository.PaymentTypeGroupRepository;
import com.ngo.finance.paymentType.ledger.entity.PaymentTypeLedger;
import com.ngo.finance.paymentType.ledger.repository.PaymentTypeLedgerRepository;
import com.ngo.finance.programme.entity.Programme;
import com.ngo.finance.programme.repository.ProgrammeRepository;
import com.ngo.finance.transaction.dto.request.CreateCreditNoteRequest;
import com.ngo.finance.transaction.dto.request.DebitNoteImportRequest;
import com.ngo.finance.transaction.dto.request.DebitNoteImportRequest.Row;
import com.ngo.finance.transaction.repository.DebitNoteRepository;
import com.ngo.finance.vendorRegister.entity.VendorRegister;
import com.ngo.finance.vendorRegister.repository.VendorRegisterRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** POST /api/v1/debit-notes/import — rows checked like the form, with budget and fund totals counted across the file. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser
public class DebitNoteImportIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ProgrammeRepository programmeRepository;
    @Autowired
    private FinancialYearRepository financialYearRepository;
    @Autowired
    private PaymentModeRepository paymentModeRepository;
    @Autowired
    private PaymentTypeGroupRepository groupRepository;
    @Autowired
    private PaymentTypeLedgerRepository ledgerRepository;
    @Autowired
    private VendorRegisterRepository vendorRepository;
    @Autowired
    private EmployeeRepository employeeRepository;
    @Autowired
    private DonorRepository donorRepository;
    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;
    @Autowired
    private DebitNoteRepository debitNoteRepository;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    /** Q1 row of a ₹1,000 LC line. */
    private String q1Row;
    private String mode;
    private PaymentTypeGroup group;
    private PaymentTypeLedger ledger;
    private VendorRegister vendor;

    @BeforeEach
    void setUp() throws Exception {
        Long programmeId = programmeRepository.save(Programme.builder()
                .programmeCode("PRG-DNIMP-IT").programmeName("Debit import IT Programme").build()).getId();
        Long fyId = financialYearRepository.findAllByOrderByStartDateAsc().stream()
                .filter(fy -> fy.getStartDate().getYear() == 2026)
                .findFirst()
                .orElseGet(() -> financialYearRepository.save(FinancialYear.builder()
                        .code("FY 2026-27").startDate(LocalDate.of(2026, 4, 1)).endDate(LocalDate.of(2027, 3, 31)).build()))
                .getId();
        SaveBudgetRequest budget = SaveBudgetRequest.builder()
                .name("Debit import IT budget")
                .financialYearId(fyId)
                .budgetType(BudgetType.PROGRAMME)
                .programmeId(programmeId)
                .lines(List.of(BudgetLineRequest.builder()
                        .categoryId(1L).description("Field travel").book(ContributionType.LC)
                        .q1(new BigDecimal("1000")).build()))
                .submit(true)
                .actor("Tester")
                .build();
        String code = json(postJson("/api/v1/budgets", budget, 201)).get("budgetCode").asText();
        Long budgetId = null;
        for (JsonNode node : json(mockMvc.perform(get("/api/v1/budgets")).andReturn().getResponse().getContentAsString())) {
            if (code.equals(node.get("budgetCode").asText())) {
                budgetId = node.get("id").asLong();
            }
        }
        mockMvc.perform(patch("/api/v1/budgets/" + budgetId + "/approve").with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        q1Row = code + "-BL01-Q1";

        mode = paymentModeRepository.findAll().stream().filter(m -> !Boolean.FALSE.equals(m.getStatus()))
                .findFirst().orElseThrow().getName();
        List<PaymentTypeLedger> ledgers = ledgerRepository.findAll().stream().filter(l -> !Boolean.FALSE.equals(l.getStatus())).toList();
        assumeTrue(!ledgers.isEmpty(), "no payment type ledgers seeded");
        ledger = ledgers.get(0);
        group = groupRepository.findById(ledger.getGroupId()).orElseThrow();
        vendor = vendorRepository.findAll().stream().filter(v -> !Boolean.FALSE.equals(v.getStatus()) && v.getVendorCode() != null)
                .findFirst().orElse(null);
        assumeTrue(vendor != null, "no active vendor seeded");
    }

    private String postJson(String url, Object body, int expected) throws Exception {
        return mockMvc.perform(post(url).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private JsonNode json(String body) throws Exception {
        return objectMapper.readTree(body);
    }

    private Row.RowBuilder row(int n, String amount, String reference) {
        return Row.builder().rowNumber(n).date("2026-06-10").outflowLineId(q1Row).amountInr(amount)
                .payeeCategory("Vendor").payeeCode(vendor.getVendorCode()).paidVia(mode)
                .paymentGroup(group.getName()).ledger(ledger.getName()).reference(reference);
    }

    private JsonNode send(boolean dryRun, List<Integer> selected, Row... rows) throws Exception {
        return json(postJson("/api/v1/debit-notes/import", DebitNoteImportRequest.builder()
                .dryRun(dryRun).actor("Importer").selected(selected).rows(List.of(rows)).build(), 200));
    }

    private static JsonNode at(JsonNode response, int n) {
        return StreamSupport.stream(response.path("rows").spliterator(), false)
                .filter(r -> r.path("rowNumber").asInt() == n).findFirst().orElseThrow();
    }

    private static String errors(JsonNode row) {
        return row.path("errors").toString();
    }

    @Test
    void testDryRunResolvesTheRowAndSavesNothing() throws Exception {
        long before = debitNoteRepository.count();
        JsonNode res = send(true, null, row(2, "400", "UTR-DN-1").build());
        JsonNode r = at(res, 2);
        assertThat(r.path("status").asText()).as(errors(r)).isEqualTo("READY");
        assertThat(r.path("book").asText()).isEqualTo("LC"); // from the outflow line
        assertThat(r.path("payeeName").asText()).isEqualTo(vendor.getLegalName());
        assertThat(r.path("lineName").asText()).isEqualTo("Field travel");
        assertThat(debitNoteRepository.count()).isEqualTo(before);
    }

    @Test
    void testEachKindOfErrorIsReportedOnItsRow() throws Exception {
        JsonNode res = send(true, null,
                row(2, "10", "a").outflowLineId("BUD-2026-999-BL01-Q1").build(),
                row(3, "10", "b").payeeCode("NOPE-1").build(),
                row(4, "10", "c").payeeCategory("Donor").build(),
                row(5, "10", "d").paymentGroup("Nope group").build(),
                row(6, "10", "e").ledger("Not a ledger").build(),
                row(7, "10", "f").paidVia("Pigeon").build(),
                row(8, "1500", "g").build(),
                row(9, "1500", "h").reason("Because").build(),
                row(10, "10", "i").tallyVoucherType("Payment").build());
        assertThat(errors(at(res, 2))).contains("outflow_line_id");
        assertThat(errors(at(res, 3))).contains("is not a vendor code");
        assertThat(errors(at(res, 4))).contains("must be Employee or Vendor");
        assertThat(errors(at(res, 5))).contains("is not an active payment group");
        assertThat(errors(at(res, 6))).contains("is not an active ledger under " + group.getName());
        assertThat(errors(at(res, 7))).contains("not an active payment mode");
        assertThat(errors(at(res, 8))).contains("reason is required").contains("over budget by ₹500");
        assertThat(errors(at(res, 9))).contains("must be one of");
        assertThat(errors(at(res, 10))).contains("tally_voucher_no is required");
        for (int n = 2; n <= 10; n++) {
            assertThat(at(res, n).path("status").asText()).as("row " + n).isEqualTo("ERROR");
        }
    }

    @Test
    void testBudgetIsCountedAcrossTheFileAndOverBudgetRowsImportWithAReason() throws Exception {
        // 600 + 600 on a ₹1,000 row: the second takes it over budget.
        JsonNode dry = send(true, null, row(2, "600", "UTR-B1").build(), row(3, "600", "UTR-B2").build());
        assertThat(at(dry, 2).path("status").asText()).isEqualTo("READY");
        assertThat(errors(at(dry, 3))).contains("over budget by ₹200");

        JsonNode saved = send(false, null, row(2, "600", "UTR-B1").build(), row(3, "600", "UTR-B2").reason("price-revision").build()); // matched by name, ignoring case and punctuation
        assertThat(saved.path("createdCount").asInt()).isEqualTo(2);
        assertThat(at(saved, 3).path("warnings").toString()).contains("reason: Price revision");
        var note = debitNoteRepository.findByNoteCode(at(saved, 3).path("noteCode").asText()).orElseThrow();
        assertThat(note.getOverBudgetReason().getName()).isEqualTo("Price revision");
        assertThat(note.getGroupName()).isEqualTo(group.getName());
        assertThat(note.getLedgerName()).isEqualTo(ledger.getName());
        assertThat(note.getRemarks()).isEqualTo("Imported from CSV");

        // The saved notes count: the row is now over budget, so any further debit needs a reason.
        JsonNode picked = send(true, null, row(2, "5", "UTR-B3").build());
        assertThat(errors(at(picked, 2))).contains("reason is required");
    }

    @Test
    void testTallyVoucherAndDuplicates() throws Exception {
        JsonNode dry = send(true, null,
                row(2, "100", "UTR-T1").tallyVoucherNo("DNIMP-118").tallyVoucherType("Payment").build(),
                row(3, "100", "UTR-T2").tallyVoucherNo("dnimp-118").tallyVoucherType("payment").build(),
                row(4, "100", "UTR-T1").build());
        assertThat(at(dry, 2).path("tallyVoucher").asText()).isEqualTo("Payment DNIMP-118");
        assertThat(errors(at(dry, 3))).contains("is also on row 2 of this file");
        assertThat(at(dry, 4).path("duplicate").asBoolean()).isTrue();

        JsonNode saved = send(false, null, row(2, "100", "UTR-T1").tallyVoucherNo("DNIMP-118").tallyVoucherType("Payment").build());
        String code = at(saved, 2).path("noteCode").asText();
        var note = debitNoteRepository.findByNoteCode(code).orElseThrow();
        assertThat(note.getTallyVoucherNo()).isEqualTo("DNIMP-118");

        JsonNode again = send(false, List.of(2), row(2, "1", "X").tallyVoucherNo("DNIMP-118").tallyVoucherType("PAYMENT").build());
        assertThat(errors(at(again, 2))).contains("already imported as " + code);
        assertThat(again.path("createdCount").asInt()).isZero();
    }

    @Test
    void testFundBalanceIsCountedAcrossTheFile() throws Exception {
        DonorMaster donor = donorRepository.save(DonorMaster.builder()
                .donorCode("DN-DNIMP-LC").donorName("Debit Import Donor")
                .donorType(donorTypeMasterRepository.searchByName("Corporate CSR").get(0))
                .email("dnimp@example.com")
                .fundSourceDomicile(FundSourceDomicile.DOMESTIC).isActive(true).build());
        CreateFundProfileRequest terms = CreateFundProfileRequest.builder()
                .fundMode(FundMode.UNRESTRICTED).fundClass(FundClass.CLASS_C_UNRESTRICTED).purpose("Debit import test")
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("5000")).disbursementType(DisbursementType.LUMP_SUM)
                        .receivingDate(LocalDate.of(2026, 6, 1))
                        .trancheCriteria(List.of(TrancheCriterionItem.builder()
                                .amountCriteria(new BigDecimal("5000")).expectedReleaseDate(LocalDate.of(2026, 6, 1)).isFinalTranche(true)
                                .criteria(List.of(ReleaseCriterionItem.builder().releaseCriteria(CriterionType.ON_SIGNING).build()))
                                .build()))
                        .build()))
                .build();
        JsonNode fund = json(postJson("/api/v1/funding", FundingRequest.builder().donorId(donor.getId()).terms(terms).build(), 201))
                .path("terms");
        String fundCode = fund.path("profileCode").asText();
        String fundId = fund.path("id").asText();
        // ₹500 received into the fund.
        postJson("/api/v1/credit-notes", CreateCreditNoteRequest.builder()
                .date(LocalDate.of(2026, 6, 1)).amount(new BigDecimal("500")).book(ContributionType.LC)
                .paymentMode(new RefDto("1", mode))
                .donor(new RefDto(String.valueOf(donor.getId()), donor.getDonorName()))
                .fundProfile(new RefDto(fundId, fundCode)).actor("Tester").build(), 201);

        JsonNode res = send(true, null,
                row(2, "300", "UTR-F1").fundProfileCode(fundCode).build(),
                row(3, "300", "UTR-F2").fundProfileCode(fundCode).build());
        assertThat(at(res, 2).path("status").asText()).as(errors(at(res, 2))).isEqualTo("READY");
        assertThat(at(res, 2).path("donorName").asText()).isEqualTo("Debit Import Donor"); // from the fund
        assertThat(errors(at(res, 3))).contains("Only ₹200 is available on " + fundCode + " after the earlier rows of this file");
        assertThat(Objects.requireNonNull(at(res, 3).path("status").asText())).isEqualTo("ERROR");
    }
}
