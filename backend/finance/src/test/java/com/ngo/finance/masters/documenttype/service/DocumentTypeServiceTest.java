package com.ngo.finance.masters.documenttype.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.masters.documenttype.dto.DocumentTypeRequest;
import com.ngo.finance.masters.documenttype.entity.DocumentTypeMaster;
import com.ngo.finance.masters.documenttype.repository.DocumentTypeMasterRepository;
import com.ngo.finance.masters.donortype.entity.DonorTypeMaster;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DocumentTypeServiceTest {

    private static final Set<FundSourceDomicile> BOTH = Set.of(FundSourceDomicile.DOMESTIC, FundSourceDomicile.FOREIGN);

    @Mock
    private DocumentTypeMasterRepository repository;

    @Mock
    private DonorTypeMasterRepository donorTypeRepository;

    @InjectMocks
    private DocumentTypeService service;

    private static DocumentTypeMaster type(long id, String name, boolean active, FundSourceDomicile... domiciles) {
        DocumentTypeMaster t = DocumentTypeMaster.builder().name(name).status(active).build();
        t.setId(id);
        t.getAllowedFundSourceDomiciles().addAll(Set.of(domiciles));
        return t;
    }

    /* ---------- create / update ---------- */

    @Test
    void create_savesByNameAndStartsActive() {
        when(repository.existsByNameIgnoreCase("GST Number")).thenReturn(false);
        when(repository.save(any(DocumentTypeMaster.class))).thenAnswer(inv -> inv.getArgument(0));

        var created = service.create(DocumentTypeRequest.builder().name("  GST Number ").allowedFundSourceDomiciles(BOTH).build());

        assertEquals("GST Number", created.getName());
        assertEquals("ACTIVE", created.getStatus());
        assertEquals(List.of("DOMESTIC", "FOREIGN"), created.getAllowedFundSourceDomiciles());
    }

    @Test
    void create_needsAFundSourceDomicile() {
        when(repository.existsByNameIgnoreCase("TIN")).thenReturn(false);

        ValidationException e = assertThrows(ValidationException.class,
                () -> service.create(DocumentTypeRequest.builder().name("TIN").build()));
        assertEquals("Choose the fund source domicile — Domestic, Foreign or both", e.getErrors().get("allowedFundSourceDomiciles"));
    }

    @Test
    void update_needsAFundSourceDomicileToo() {
        when(repository.findById(1L)).thenReturn(Optional.of(type(1, "PAN Card", true, FundSourceDomicile.DOMESTIC)));

        assertThrows(ValidationException.class,
                () -> service.update(1L, DocumentTypeRequest.builder().name("PAN Card").allowedFundSourceDomiciles(Set.of()).build()));
    }

    @Test
    void create_rejectsADuplicateName() {
        when(repository.existsByNameIgnoreCase("PAN Card")).thenReturn(true);

        assertThrows(ValidationException.class,
                () -> service.create(DocumentTypeRequest.builder().name("PAN Card").allowedFundSourceDomiciles(BOTH).build()));
    }

    @Test
    void create_savesTheChosenDomicile() {
        when(repository.existsByNameIgnoreCase("TIN")).thenReturn(false);
        when(repository.save(any(DocumentTypeMaster.class))).thenAnswer(inv -> inv.getArgument(0));

        var created = service.create(DocumentTypeRequest.builder()
                .name("TIN")
                .allowedFundSourceDomiciles(Set.of(FundSourceDomicile.FOREIGN))
                .build());

        assertEquals(List.of("FOREIGN"), created.getAllowedFundSourceDomiciles());
    }

    @Test
    void create_savesTheDonorTypesItIsRequiredFor_andRejectsUnknownOnes() {
        when(repository.existsByNameIgnoreCase("CSR-1")).thenReturn(false);
        when(repository.save(any(DocumentTypeMaster.class))).thenAnswer(inv -> inv.getArgument(0));
        when(donorTypeRepository.findAllById(Set.of(3L))).thenReturn(List.of(new DonorTypeMaster()));

        var created = service.create(DocumentTypeRequest.builder().name("CSR-1").allowedFundSourceDomiciles(BOTH)
                .requiredForDonorTypeIds(Set.of(3L)).build());
        assertEquals(List.of(3L), created.getRequiredForDonorTypeIds());

        when(donorTypeRepository.findAllById(Set.of(99L))).thenReturn(List.of());
        when(repository.existsByNameIgnoreCase("CSR-2")).thenReturn(false);
        assertThrows(ValidationException.class,
                () -> service.create(DocumentTypeRequest.builder().name("CSR-2").allowedFundSourceDomiciles(BOTH)
                        .requiredForDonorTypeIds(Set.of(99L)).build()));
    }

    /* ---------- a donor's document ---------- */

    @Test
    void requireUsable_allowsNoDocument() {
        assertNull(service.requireUsable(null, null, FundSourceDomicile.DOMESTIC));
    }

    @Test
    void requireUsable_rejectsAnUnknownType() {
        when(repository.findById(404L)).thenReturn(Optional.empty());

        ValidationException e = assertThrows(ValidationException.class,
                () -> service.requireUsable(404L, null, FundSourceDomicile.DOMESTIC));
        assertEquals("Unknown document type", e.getErrors().get("documentTypeId"));
    }

    @Test
    void requireUsable_rejectsAnInactiveTypeForANewChoice() {
        when(repository.findById(5L)).thenReturn(Optional.of(type(5, "Voter ID", false, FundSourceDomicile.DOMESTIC)));

        assertThrows(ValidationException.class, () -> service.requireUsable(5L, 1L, FundSourceDomicile.DOMESTIC));
    }

    @Test
    void requireUsable_letsADonorKeepATypeDeactivatedLater() {
        when(repository.findById(5L)).thenReturn(Optional.of(type(5, "Voter ID", false, FundSourceDomicile.DOMESTIC)));

        assertEquals(5L, service.requireUsable(5L, 5L, FundSourceDomicile.DOMESTIC));
    }

    @Test
    void requireUsable_rejectsATypeMeantForTheOtherDomicile() {
        when(repository.findById(1L)).thenReturn(Optional.of(type(1, "PAN Card", true, FundSourceDomicile.DOMESTIC)));

        assertEquals(1L, service.requireUsable(1L, null, FundSourceDomicile.DOMESTIC));
        ValidationException e = assertThrows(ValidationException.class,
                () -> service.requireUsable(1L, null, FundSourceDomicile.FOREIGN));
        assertEquals("PAN Card is not used for foreign donors", e.getErrors().get("documentTypeId"));
    }

    @Test
    void requireUsable_allowsATypeOfferedToBoth() {
        when(repository.findById(7L)).thenReturn(Optional.of(type(7, "Passport ID", true, FundSourceDomicile.DOMESTIC, FundSourceDomicile.FOREIGN)));

        assertEquals(7L, service.requireUsable(7L, null, FundSourceDomicile.FOREIGN));
    }

    /* ---------- documents required by donor type ---------- */

    @Test
    void requireForDonorType_passesWhenTheDonorTypeNeedsNothing() {
        when(repository.findActiveRequiredFor(7L)).thenReturn(List.of());
        service.requireForDonorType(7L, "Individual", null, FundSourceDomicile.DOMESTIC);
    }

    @Test
    void requireForDonorType_needsOneOfTheRequiredDocuments() {
        when(repository.findActiveRequiredFor(3L)).thenReturn(List.of(
                type(1, "PAN Card", true, FundSourceDomicile.DOMESTIC),
                type(2, "GST Number", true, FundSourceDomicile.DOMESTIC, FundSourceDomicile.FOREIGN)));

        ValidationException missing = assertThrows(ValidationException.class,
                () -> service.requireForDonorType(3L, "Corporate CSR", null, FundSourceDomicile.DOMESTIC));
        assertEquals("Corporate CSR donors need PAN Card or GST Number", missing.getMessage());
        assertEquals("Corporate CSR donors need PAN Card or GST Number", missing.getErrors().get("documentTypeId"));

        assertThrows(ValidationException.class,
                () -> service.requireForDonorType(3L, "Corporate CSR", 5L, FundSourceDomicile.DOMESTIC));
        service.requireForDonorType(3L, "Corporate CSR", 2L, FundSourceDomicile.DOMESTIC);
    }

    @Test
    void requireForDonorType_ignoresRequiredTypesNotOfferedToTheDomicile() {
        // PAN is required for the type but only offered to domestic donors — a foreign donor isn't held to it.
        when(repository.findActiveRequiredFor(3L)).thenReturn(List.of(type(1, "PAN Card", true, FundSourceDomicile.DOMESTIC)));
        service.requireForDonorType(3L, "Foundation", null, FundSourceDomicile.FOREIGN);
    }
}
