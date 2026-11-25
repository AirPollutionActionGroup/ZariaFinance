package com.ngo.finance.transaction.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.bankDetails.entity.BankDetail;
import com.ngo.finance.bankDetails.repository.BankDetailRepository;
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
import com.ngo.finance.donor.enums.FxRateSource;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import com.ngo.finance.paymentMode.repository.PaymentModeRepository;
import com.ngo.finance.transaction.dto.request.CreditNoteImportRequest;
import com.ngo.finance.transaction.dto.request.CreditNoteImportRequest.Row;
import com.ngo.finance.transaction.repository.CreditNoteRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
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

/** POST /api/v1/credit-notes/import — rows checked like the form, valid ones saved, duplicates only when selected. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class CreditNoteImportIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private DonorRepository donorRepository;
    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;
    @Autowired
    private PaymentModeRepository paymentModeRepository;
    @Autowired
    private BankDetailRepository bankDetailRepository;
    @Autowired
    private CreditNoteRepository creditNoteRepository;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private String mode;
    private DonorMaster lcDonor;
    private DonorMaster fcDonor;
    private String lumpFund;
    private String fcFund;
    private String fcT1;

    private DonorMaster seedDonor(String suffix, FundSourceDomicile domicile) {
        return donorRepository.save(DonorMaster.builder()
                .donorCode("DN-IMP-" + suffix)
                .donorName("Import Donor " + suffix)
                .donorType(donorTypeMasterRepository.searchByName("Corporate CSR").get(0))
                .email("import" + suffix + "@example.com")
                .fundSourceDomicile(domicile)
                .isActive(true)
                .build());
    }

    private static TrancheCriterionItem tranche(String inr, String usd, LocalDate date, boolean last) {
        return TrancheCriterionItem.builder()
                .amountCriteria(new BigDecimal(inr))
                .foreignAmount(usd == null ? null : new BigDecimal(usd))
                .expectedReleaseDate(date)
                .isFinalTranche(last)
                .criteria(List.of(ReleaseCriterionItem.builder().releaseCriteria(CriterionType.ON_SIGNING).build()))
                .build();
    }

    private JsonNode createFunding(DonorMaster donor, DisbursementRuleItem rule) throws Exception {
        CreateFundProfileRequest terms = CreateFundProfileRequest.builder()
                .fundMode(FundMode.UNRESTRICTED)
                .fundClass(FundClass.CLASS_C_UNRESTRICTED)
                .purpose("Import test")
                .disbursementRules(List.of(rule))
                .build();
        String body = mockMvc.perform(post("/api/v1/funding").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(FundingRequest.builder().donorId(donor.getId()).terms(terms).build())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).path("terms");
    }

    @BeforeEach
    void seed() throws Exception {
        mode = paymentModeRepository.findAll().stream()
                .filter(m -> !Boolean.FALSE.equals(m.getStatus()))
                .findFirst().orElseThrow(() -> new IllegalStateException("No payment mode seeded")).getName();
        lcDonor = seedDonor("LC", FundSourceDomicile.DOMESTIC);
        fcDonor = seedDonor("FC", FundSourceDomicile.FOREIGN);
        // LC lump sum of ₹50,000
        lumpFund = createFunding(lcDonor, DisbursementRuleItem.builder()
                .totalAmount(new BigDecimal("50000"))
                .disbursementType(DisbursementType.LUMP_SUM)
                .receivingDate(LocalDate.of(2026, 12, 1))
                .trancheCriteria(List.of(tranche("50000", null, LocalDate.of(2026, 12, 1), true)))
                .build()).path("profileCode").asText();
        // FC: USD 10,000 at ₹88.50 in two tranches
        JsonNode fc = createFunding(fcDonor, DisbursementRuleItem.builder()
                .totalAmount(new BigDecimal("885000"))
                .disbursementType(DisbursementType.TRANCHES)
                .currency("USD").foreignAmount(new BigDecimal("10000")).fxRate(new BigDecimal("88.5"))
                .fxRateDate(LocalDate.of(2026, 11, 11)).fxRateSource(FxRateSource.FBIL)
                .trancheCriteria(List.of(
                        tranche("531000", "6000", LocalDate.of(2026, 12, 1), false),
                        tranche("354000", "4000", LocalDate.of(2027, 3, 1), true)))
                .build());
        fcFund = fc.path("profileCode").asText();
        fcT1 = fc.path("disbursementRules").get(0).path("trancheCriteria").get(0).path("trancheCode").asText();
    }

    private Row.RowBuilder lcRow(int n, String amount, String reference) {
        return Row.builder().rowNumber(n).date("2026-11-20").book("LC").amountInr(amount).receivedVia(mode)
                .reference(reference).donorCode(lcDonor.getDonorCode()).fundProfileCode(lumpFund);
    }

    private JsonNode send(boolean dryRun, List<Integer> selected, Row... rows) throws Exception {
        String body = mockMvc.perform(post("/api/v1/credit-notes/import").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(CreditNoteImportRequest.builder()
                                .dryRun(dryRun).actor("Importer").selected(selected).rows(List.of(rows)).build())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private static JsonNode row(JsonNode response, int n) {
        return StreamSupport.stream(response.path("rows").spliterator(), false)
                .filter(r -> r.path("rowNumber").asInt() == n).findFirst().orElseThrow();
    }

    private static String errors(JsonNode row) {
        return row.path("errors").toString();
    }

    @Test
    @WithMockUser
    void testDryRunChecksRowsAndSavesNothing() throws Exception {
        long before = creditNoteRepository.count();
        JsonNode res = send(true, null, lcRow(2, "1,000", "UTR-IMP-1").build());
        assertThat(res.path("createdCount").asInt()).isZero();
        assertThat(row(res, 2).path("status").asText()).isEqualTo("READY");
        assertThat(row(res, 2).path("fundProfileCode").asText()).isEqualTo(lumpFund);
        assertThat(creditNoteRepository.count()).isEqualTo(before);
    }

    @Test
    @WithMockUser
    void testEachKindOfErrorIsReportedOnItsRow() throws Exception {
        JsonNode res = send(true, null,
                lcRow(2, "1000", "a").donorCode("DN-NOPE").build(),
                lcRow(3, "1000", "b").receivedVia("Pigeon").build(),
                lcRow(4, "1000", "c").date("31-31-2026").build(),
                lcRow(5, "1000", "d").fundProfileCode(fcFund).build(),
                Row.builder().rowNumber(6).date("2026-11-20").book("FC").receivedVia(mode)
                        .donorCode(fcDonor.getDonorCode()).fundProfileCode(fcFund)
                        .currency("USD").foreignAmount("1000").fxRate("88.25").build(),
                Row.builder().rowNumber(7).date("2026-11-20").book("FC").receivedVia(mode).amountInr("90000")
                        .donorCode(fcDonor.getDonorCode()).fundProfileCode(fcFund).trancheCode(fcT1)
                        .currency("USD").foreignAmount("1000").fxRate("88.25").build(),
                lcRow(8, "1000", "e").book("FC").build());
        assertThat(errors(row(res, 2))).contains("donor_code DN-NOPE not found");
        assertThat(errors(row(res, 3))).contains("not an active payment mode");
        assertThat(errors(row(res, 4))).contains("isn't a date");
        assertThat(errors(row(res, 5))).contains("belongs to");
        assertThat(errors(row(res, 6))).contains("tranche_code is required");
        assertThat(errors(row(res, 7))).contains("≠ foreign_amount × fx_rate");
        assertThat(errors(row(res, 8))).contains("is on the LC book, not FC");
        for (int n = 2; n <= 8; n++) {
            assertThat(row(res, n).path("status").asText()).as("row " + n).isEqualTo("ERROR");
        }
    }

    @Test
    @WithMockUser
    void testValidRowsImportAndBadRowsAreSkipped() throws Exception {
        long before = creditNoteRepository.count();
        JsonNode res = send(false, null,
                lcRow(2, "2000", "UTR-IMP-2").build(),
                lcRow(3, "1000", "UTR-IMP-3").donorCode("DN-NOPE").build(),
                // FC tranche: INR worked out from USD 1,000 × 88.25
                Row.builder().rowNumber(4).date("2026-11-20").book("FC").receivedVia(mode).reference("SWIFT-IMP-4")
                        .donorCode(fcDonor.getDonorCode()).fundProfileCode(fcFund).trancheCode(fcT1)
                        .currency("USD").foreignAmount("1000").fxRate("88.25").build());
        assertThat(res.path("createdCount").asInt()).isEqualTo(2);
        assertThat(row(res, 2).path("status").asText()).isEqualTo("IMPORTED");
        assertThat(row(res, 3).path("status").asText()).isEqualTo("ERROR");
        assertThat(row(res, 4).path("status").asText()).isEqualTo("IMPORTED");
        assertThat(creditNoteRepository.count()).isEqualTo(before + 2);

        var fcNote = creditNoteRepository.findByNoteCode(row(res, 4).path("noteCode").asText()).orElseThrow();
        assertThat(fcNote.getAmount()).isEqualByComparingTo("88250");
        assertThat(fcNote.getCurrency()).isEqualTo("USD");
        assertThat(fcNote.getTrancheName()).startsWith(fcT1);
        assertThat(fcNote.getDisbursementType()).isEqualTo("Tranches");
        assertThat(fcNote.getBook()).isEqualTo(ContributionType.FC);
        assertThat(fcNote.getRemarks()).isEqualTo("Imported from CSV");

        var lcNote = creditNoteRepository.findByNoteCode(row(res, 2).path("noteCode").asText()).orElseThrow();
        assertThat(lcNote.getDisbursementType()).isEqualTo("Lump Sum");
        assertThat(lcNote.getFundProfileName()).startsWith(lumpFund);
    }

    @Test
    @WithMockUser
    void testDuplicatesAreFlaggedAndImportedOnlyWhenSelected() throws Exception {
        // Same date + amount + reference twice in one file.
        JsonNode dry = send(true, null, lcRow(2, "3000", "UTR-DUP").build(), lcRow(3, "3000", "utr-dup").build());
        assertThat(row(dry, 2).path("duplicate").asBoolean()).isFalse();
        assertThat(row(dry, 3).path("duplicate").asBoolean()).isTrue();
        assertThat(row(dry, 3).path("status").asText()).isEqualTo("WARNING");

        JsonNode first = send(false, null, lcRow(2, "3000", "UTR-DUP").build(), lcRow(3, "3000", "utr-dup").build());
        assertThat(first.path("createdCount").asInt()).isEqualTo(1);
        assertThat(row(first, 3).path("status").asText()).isEqualTo("SKIPPED");

        // Now it exists: the same row is a duplicate of a saved note, imported only when ticked.
        JsonNode again = send(false, List.of(2), lcRow(2, "3000", "UTR-DUP").build());
        assertThat(row(again, 2).path("warnings").toString()).contains("already exists");
        assertThat(row(again, 2).path("status").asText()).isEqualTo("IMPORTED");
    }

    @Test
    @WithMockUser
    void testTallyVoucherIsSavedAndCanBeImportedOnlyOnce() throws Exception {
        // Twice in one file → the second is an error; a type needs its number.
        JsonNode dry = send(true, null,
                lcRow(2, "4000", "UTR-T1").tallyVoucherType("Receipt").tallyVoucherNo("IMP-245").build(),
                lcRow(3, "4100", "UTR-T2").tallyVoucherType("receipt").tallyVoucherNo("imp-245").build(),
                lcRow(4, "4200", "UTR-T3").tallyVoucherType("Receipt").build(),
                // Same number, different voucher type → a different voucher, fine.
                lcRow(5, "4300", "UTR-T4").tallyVoucherType("Journal").tallyVoucherNo("IMP-245").build());
        assertThat(row(dry, 2).path("status").asText()).isEqualTo("READY");
        assertThat(row(dry, 2).path("tallyVoucher").asText()).isEqualTo("Receipt IMP-245");
        assertThat(errors(row(dry, 3))).contains("is also on row 2 of this file");
        assertThat(errors(row(dry, 4))).contains("tally_voucher_no is required with tally_voucher_type");
        assertThat(row(dry, 5).path("status").asText()).isEqualTo("READY");

        JsonNode saved = send(false, null, lcRow(2, "4000", "UTR-T1").tallyVoucherType("Receipt").tallyVoucherNo("IMP-245").build());
        String code = row(saved, 2).path("noteCode").asText();
        var note = creditNoteRepository.findByNoteCode(code).orElseThrow();
        assertThat(note.getTallyVoucherType()).isEqualTo("Receipt");
        assertThat(note.getTallyVoucherNo()).isEqualTo("IMP-245");

        // Already imported → an error, even when ticked; other columns don't matter.
        JsonNode again = send(false, List.of(2), lcRow(2, "9999", "OTHER").tallyVoucherType("RECEIPT").tallyVoucherNo("imp-245").build());
        assertThat(row(again, 2).path("status").asText()).isEqualTo("ERROR");
        assertThat(errors(row(again, 2))).contains("already imported as " + code);
        assertThat(again.path("createdCount").asInt()).isZero();
    }

    @Test
    @WithMockUser
    void testBankAccountMustBeOnTheNotesBook() throws Exception {
        BankDetail fcAccount = bankDetailRepository.findAll().stream()
                .filter(b -> b.getBook() == ContributionType.FC && !Boolean.FALSE.equals(b.getStatus()))
                .findFirst().orElse(null);
        if (fcAccount == null) {
            return; // no FC account seeded in this database
        }
        JsonNode res = send(true, null, lcRow(2, "1000", "UTR-B").bankAccount(fcAccount.getAccountNumber()).build());
        assertThat(errors(row(res, 2))).contains("is on the FC book, not LC");
    }
}
