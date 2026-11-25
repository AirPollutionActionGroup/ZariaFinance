package com.ngo.finance.donor.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.dto.request.CreateDonorRequest;
import com.ngo.finance.donor.dto.request.DonorContactItem;
import com.ngo.finance.donor.dto.request.UpdateDonorRequest;
import com.ngo.finance.donor.repository.DonorContactRepository;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser
public class DonorControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;

    @Autowired
    private DonorContactRepository donorContactRepository;

    @Autowired
    private com.ngo.finance.masters.documenttype.repository.DocumentTypeMasterRepository documentTypeRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

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

    private static DonorContactItem contact(String name, String email, boolean primary) {
        return DonorContactItem.builder().name(name).email(email).isPrimary(primary).build();
    }

    private CreateDonorRequest donor(String code, List<DonorContactItem> contacts) {
        CreateDonorRequest request = new CreateDonorRequest();
        request.setDonorCode(code);
        request.setDonorName("Integration Test Donor");
        request.setDonorTypeId(donorTypeMasterRepository.searchByName("Corporate CSR").get(0).getId());
        request.setFundSourceDomicile(FundSourceDomicile.DOMESTIC);
        request.setEmail("test@example.com");
        request.setContacts(contacts);
        return request;
    }

    /** Updates replace the whole donor (as the form sends it), so every required field goes with the contacts. */
    private static UpdateDonorRequest update(String name, List<DonorContactItem> contacts) {
        UpdateDonorRequest request = new UpdateDonorRequest();
        request.setDonorName(name);
        request.setFundSourceDomicile(FundSourceDomicile.DOMESTIC);
        request.setEmail("test@example.com");
        request.setContacts(contacts);
        return request;
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, Object body)
            throws Exception {
        return mockMvc.perform(builder.with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    @Test
    public void testRequiredDocumentForTheDonorType() throws Exception {
        long csr = donorTypeMasterRepository.searchByName("Corporate CSR").get(0).getId();
        // A document type of its own (a fresh database has no "GST Number"), for both domiciles.
        long gst = objectMapper.readTree(send(post("/api/v1/document-types"),
                        java.util.Map.of("name", "GST Number (test)", "allowedFundSourceDomiciles", List.of("DOMESTIC", "FOREIGN")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("id").asLong();
        // The fund source domicile is mandatory on a document type.
        send(put("/api/v1/document-types/{id}", gst),
                java.util.Map.of("name", "GST Number (test)", "requiredForDonorTypeIds", List.of(csr)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.allowedFundSourceDomiciles").exists());
        send(put("/api/v1/document-types/{id}", gst),
                java.util.Map.of("name", "GST Number (test)", "allowedFundSourceDomiciles", List.of("DOMESTIC", "FOREIGN"),
                        "requiredForDonorTypeIds", List.of(csr)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowedFundSourceDomiciles.length()").value(2))
                .andExpect(jsonPath("$.requiredForDonorTypeIds[0]").value(csr));

        // A CSR donor without it is refused, with the message on the document field.
        send(post("/api/v1/donors"), donor("DN-REQ-1", List.of(contact("A", "a@example.com", true))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.documentTypeId").value("Corporate CSR donors need GST Number (test)"));

        // With it, the donor is saved.
        CreateDonorRequest withGst = donor("DN-REQ-2", List.of(contact("B", "b@example.com", true)));
        withGst.setDocumentTypeId(gst);
        withGst.setDocumentNumber("27AAPFU0939F1ZV");
        send(post("/api/v1/donors"), withGst)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.documentTypeId").value(gst));
    }

    @Test
    public void testCreateDonor_Success() throws Exception {
        send(post("/api/v1/donors"), donor("DN-999", List.of(contact("Test SPOC", "spoc@example.com", true))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.donorCode").value("DN-999"))
                .andExpect(jsonPath("$.donorName").value("Integration Test Donor"))
                .andExpect(jsonPath("$.isActive").value(true)) // created on the form → Active
                .andExpect(jsonPath("$.contacts[0].name").value("Test SPOC"))
                .andExpect(jsonPath("$.contacts[0].isPrimary").value(true));
    }

    @Test
    public void testContacts_SeveralWithOnePrimary_ThenEdited() throws Exception {
        DonorContactItem second = contact("Ravi Iyer", "ravi@example.com", true);
        second.setPhone(" +91 98200 11111 ");
        String body = send(post("/api/v1/donors"), donor("DN-998", List.of(
                        contact("Asha Rao", "asha@example.com", false),
                        second,
                        contact("Meera Das", "meera@example.com", false))))
                .andExpect(status().isCreated())
                // The primary is listed first, then the others in the order entered.
                .andExpect(jsonPath("$.contacts.length()").value(3))
                .andExpect(jsonPath("$.contacts[0].name").value("Ravi Iyer"))
                .andExpect(jsonPath("$.contacts[0].phone").value("+91 98200 11111"))
                .andExpect(jsonPath("$.contacts[1].name").value("Asha Rao"))
                .andExpect(jsonPath("$.contacts[2].name").value("Meera Das"))
                .andReturn().getResponse().getContentAsString();
        JsonNode created = objectMapper.readTree(body);
        long donorId = created.get("id").asLong();
        long raviId = created.at("/contacts/0/id").asLong();
        long ashaId = created.at("/contacts/1/id").asLong();

        // Edit: Asha becomes primary and takes Meera's old email, Meera is removed, a new contact is added.
        DonorContactItem asha = contact("Asha Rao", "meera@example.com", true);
        asha.setId(ashaId);
        DonorContactItem ravi = contact("Ravi Iyer", "ravi@example.com", false);
        ravi.setId(raviId);
        send(put("/api/v1/donors/" + donorId),
                update("Integration Test Donor", List.of(asha, ravi, contact("Kiran Shah", "kiran@example.com", false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contacts.length()").value(3))
                .andExpect(jsonPath("$.contacts[0].id").value(ashaId))
                .andExpect(jsonPath("$.contacts[0].isPrimary").value(true))
                .andExpect(jsonPath("$.contacts[0].email").value("meera@example.com"))
                .andExpect(jsonPath("$.contacts[1].id").value(raviId))
                .andExpect(jsonPath("$.contacts[1].isPrimary").value(false))
                .andExpect(jsonPath("$.contacts[2].name").value("Kiran Shah"));
        assertThat(donorContactRepository.findByDonorId(donorId)).hasSize(3);

        // An update without contacts leaves them as they are.
        send(put("/api/v1/donors/" + donorId), update("Renamed Donor", null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.donorName").value("Renamed Donor"))
                .andExpect(jsonPath("$.contacts.length()").value(3));

        mockMvc.perform(get("/api/v1/donors/" + donorId))
                .andExpect(jsonPath("$.contacts[0].name").value("Asha Rao"));
    }

    @Test
    public void testContacts_NoPrimaryMarked_FirstIsPrimary() throws Exception {
        send(post("/api/v1/donors"), donor("DN-997", List.of(
                        contact("One", "one@example.com", false),
                        contact("Two", "two@example.com", false))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contacts[0].name").value("One"))
                .andExpect(jsonPath("$.contacts[0].isPrimary").value(true))
                .andExpect(jsonPath("$.contacts[1].isPrimary").value(false));
    }

    @Test
    public void testContacts_Rules() throws Exception {
        // None at all.
        send(post("/api/v1/donors"), donor("DN-996", List.of())).andExpect(status().isBadRequest());
        // Missing name / bad email.
        send(post("/api/v1/donors"), donor("DN-996", List.of(contact("", "not-an-email", true))))
                .andExpect(status().isBadRequest());
        // Two primaries.
        send(post("/api/v1/donors"), donor("DN-996", List.of(
                        contact("A", "a@example.com", true), contact("B", "b@example.com", true))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.contacts").value("Only one point of contact can be primary"));
        // Same email twice (any case).
        send(post("/api/v1/donors"), donor("DN-996", List.of(
                        contact("A", "same@example.com", true), contact("B", "SAME@example.com", false))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['contacts.1.email']").value("This email is already on contact 1"));
    }

    @Test
    public void testNextDonorCode_ReturnsAFreeCode() throws Exception {
        mockMvc.perform(get("/api/v1/donors/next-code"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.donorCode").value(org.hamcrest.Matchers.matchesPattern("DNR-CD-\\d{3,}")));
    }

    @Test
    public void testGetAllDonors_Success() throws Exception {
        mockMvc.perform(get("/api/v1/donors"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }
}
