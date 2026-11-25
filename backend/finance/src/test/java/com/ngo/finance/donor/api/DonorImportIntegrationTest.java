package com.ngo.finance.donor.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.dto.request.DonorImportRequest;
import com.ngo.finance.donor.dto.request.DonorImportRequest.Row;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.repository.DonorContactRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import java.util.List;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** POST /api/v1/donors/import — rows checked like the New Donor form, codes given out in order, duplicates guarded. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser
public class DonorImportIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private DonorRepository donorRepository;
    @Autowired
    private DonorContactRepository donorContactRepository;
    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;
    @Autowired
    private com.ngo.finance.masters.documenttype.repository.DocumentTypeMasterRepository documentTypeRepository;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    /**
     * Required documents are live settings (Masters → Document types → "Required for").
     * Start each test with none, so it doesn't depend on them; the test's
     * transaction is rolled back, so the real settings are left as they were.
     */
    @org.junit.jupiter.api.BeforeEach
    void clearRequiredDocuments() {
        documentTypeRepository.findAll().forEach(t -> t.getRequiredForDonorTypeIds().clear());
        documentTypeRepository.flush();
    }

    private static Row.RowBuilder domestic(int n, String name, String pan) {
        return Row.builder().rowNumber(n).donorName(name).donorType("Corporate CSR").fundSourceDomicile("Domestic")
                .idType("PAN Card").idNumber(pan).email("info@" + pan.toLowerCase() + ".test")
                .contactName("Asha Rao").contactEmail("asha@" + pan.toLowerCase() + ".test").address("1 MG Road");
    }

    private JsonNode send(boolean dryRun, List<Integer> selected, Row... rows) throws Exception {
        String body = mockMvc.perform(post("/api/v1/donors/import").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(DonorImportRequest.builder()
                                .dryRun(dryRun).actor("Importer").selected(selected).rows(List.of(rows)).build())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private static JsonNode at(JsonNode res, int n) {
        return StreamSupport.stream(res.path("rows").spliterator(), false)
                .filter(r -> r.path("rowNumber").asInt() == n).findFirst().orElseThrow();
    }

    private static String errors(JsonNode row) {
        return row.path("errors").toString();
    }

    @Test
    void testRequiredDocumentIsCheckedPerRow() throws Exception {
        // A document type of its own, required for Corporate CSR: a CSR row with only a PAN is an error on that row.
        var gst = com.ngo.finance.masters.documenttype.entity.DocumentTypeMaster.builder().name("GST Number (test)").build();
        gst.getAllowedFundSourceDomiciles().add(com.ngo.finance.common.enums.FundSourceDomicile.DOMESTIC);
        gst.getRequiredForDonorTypeIds().add(donorTypeMasterRepository.searchByName("Corporate CSR").get(0).getId());
        documentTypeRepository.saveAndFlush(gst);

        JsonNode res = send(true, null, domestic(2, "Imp Req Ltd", "IMPRQ1111A").build());
        assertThat(at(res, 2).path("status").asText()).isEqualTo("ERROR");
        assertThat(errors(at(res, 2))).contains("Corporate CSR donors need GST Number (test)");
    }

    @Test
    void testDryRunResolvesRowsAndGivesCodesInOrder() throws Exception {
        long before = donorRepository.count();
        JsonNode res = send(true, null,
                domestic(2, "Imp Alpha Ltd", "IMPAA1111A").state("Maharashtra").city("Mumbai").build(),
                domestic(3, "Imp Beta Ltd", "IMPBB2222B").donorCode("DN-IMP-GIVEN").build(),
                domestic(4, "Imp Gamma Ltd", "IMPCC3333C").build(),
                Row.builder().rowNumber(5).donorName("Imp Foreign Fdn").donorType("foundation").fundSourceDomicile("FOREIGN")
                        .email("hello@fdn.test").contactName("Jo Smith").contactEmail("jo@fdn.test").address("5 High St")
                        .foreignCountry("United Kingdom").build());
        JsonNode r2 = at(res, 2);
        assertThat(r2.path("status").asText()).as(errors(r2)).isEqualTo("READY");
        assertThat(r2.path("book").asText()).isEqualTo("LC");
        assertThat(r2.path("idDocument").asText()).isEqualTo("PAN Card IMPAA1111A");
        assertThat(at(res, 5).path("status").asText()).as(errors(at(res, 5))).isEqualTo("READY");
        assertThat(at(res, 5).path("book").asText()).isEqualTo("FC");
        // Blank codes get consecutive codes; a given code is kept.
        String c2 = r2.path("donorCode").asText();
        String c4 = at(res, 4).path("donorCode").asText();
        assertThat(c2).matches("DNR-CD-\\d{3,}");
        assertThat(Integer.parseInt(c4.substring(7))).isEqualTo(Integer.parseInt(c2.substring(7)) + 1);
        assertThat(at(res, 3).path("donorCode").asText()).isEqualTo("DN-IMP-GIVEN");
        assertThat(donorRepository.count()).isEqualTo(before);
    }

    @Test
    void testRowsLeftOutDontUseUpCodes() throws Exception {
        JsonNode res = send(false, null,
                domestic(2, "Imp Gap One", "IMPGP1111A").build(),
                domestic(3, "Imp Gap Bad", "IMPGP2222A").email("bad").build(),
                domestic(4, "Imp Gap Two", "IMPGP3333A").build());
        assertThat(at(res, 3).path("status").asText()).isEqualTo("ERROR");
        assertThat(at(res, 3).path("donorCode").isNull()).isTrue();
        int first = Integer.parseInt(at(res, 2).path("donorCode").asText().substring(7));
        int second = Integer.parseInt(at(res, 4).path("donorCode").asText().substring(7));
        assertThat(second).isEqualTo(first + 1);
    }

    @Test
    void testEachKindOfErrorIsReportedOnItsRow() throws Exception {
        donorRepository.save(DonorMaster.builder().donorCode("DN-IMP-OLD").donorName("Imp Existing")
                .donorType(donorTypeMasterRepository.searchByName("Corporate CSR").get(0))
                .email("old@imp.test").fundSourceDomicile(FundSourceDomicile.DOMESTIC)
                .documentTypeId(documentTypeRepository.search("PAN Card").get(0).getId()).documentNumber("IMPOLD999Z").isActive(true).build());
        JsonNode res = send(true, null,
                domestic(2, "A", "IMPX00001A").donorType("Corporate CSR").fundSourceDomicile("Foreign").idType(null).idNumber(null).build(),
                domestic(3, "B", "IMPX00002A").idType(null).build(),
                domestic(4, "C", "IMPX00003A").email("not-an-email").build(),
                domestic(5, "D", "IMPX00004A").state("Atlantis").build(),
                Row.builder().rowNumber(6).donorName("E").donorType("Individual").fundSourceDomicile("Foreign")
                        .email("e@x.test").contactName("E").contactEmail("e@x.test").address("x").build(),
                domestic(7, "F", "impold999z").build(),
                domestic(8, "G", "IMPX00005A").build(),
                domestic(9, "H", "IMPX00005A").build(),
                domestic(10, "I", "IMPX00006A").donorCode("DN-IMP-OLD").build(),
                domestic(11, "J", "IMPX00007A").contactName(null).build(),
                domestic(12, "K", "IMPX00008A").donorType("Alien").build());
        assertThat(errors(at(res, 2))).contains("Corporate CSR donors can't be foreign");
        assertThat(errors(at(res, 3))).contains("id_type is required for a domestic donor");
        assertThat(errors(at(res, 4))).contains("isn't a valid email");
        assertThat(errors(at(res, 5))).contains("state \\\"Atlantis\\\" is not a state of India");
        assertThat(errors(at(res, 6))).contains("passport_id is required for a foreign individual");
        assertThat(errors(at(res, 7))).contains("PAN Card IMPOLD999Z is already on donor DN-IMP-OLD");
        assertThat(at(res, 8).path("status").asText()).isEqualTo("READY");
        assertThat(errors(at(res, 9))).contains("is also on row 8 of this file");
        assertThat(errors(at(res, 10))).contains("donor_code DN-IMP-OLD is already used");
        assertThat(errors(at(res, 11))).contains("contact_name is required");
        assertThat(errors(at(res, 12))).contains("is not an active donor type");
    }

    @Test
    void testImportSavesInactiveDonorsWithPrimaryContact_AndSameNameIsADuplicate() throws Exception {
        JsonNode saved = send(false, null,
                domestic(2, "Imp Saved Trust", "IMPSV1234S").contactPhone("+91 98200 33333").state("Karnataka").build(),
                domestic(3, "imp saved trust", "IMPSV5678S").build());
        assertThat(saved.path("createdCount").asInt()).isEqualTo(1);
        assertThat(at(saved, 3).path("duplicate").asBoolean()).isTrue();
        assertThat(at(saved, 3).path("status").asText()).isEqualTo("SKIPPED");

        long id = at(saved, 2).path("donorId").asLong();
        DonorMaster donor = donorRepository.findById(id).orElseThrow();
        assertThat(donor.getIsActive()).isFalse();
        assertThat(donor.getBook().name()).isEqualTo("LC");
        assertThat(donor.getDocumentTypeId()).isEqualTo(documentTypeRepository.search("PAN Card").get(0).getId());
        assertThat(donor.getState().getStateName()).isEqualTo("Karnataka");
        var contacts = donorContactRepository.findByDonorId(id);
        assertThat(contacts).hasSize(1);
        assertThat(contacts.get(0).getIsPrimary()).isTrue();
        assertThat(contacts.get(0).getPhone()).isEqualTo("+91 98200 33333");

        // Same name as a saved donor → a possible duplicate, imported only when ticked.
        JsonNode again = send(false, List.of(2), domestic(2, "IMP SAVED TRUST", "IMPSV9999S").build());
        assertThat(at(again, 2).path("warnings").toString()).contains("already exists");
        assertThat(at(again, 2).path("status").asText()).isEqualTo("IMPORTED");
    }
}
