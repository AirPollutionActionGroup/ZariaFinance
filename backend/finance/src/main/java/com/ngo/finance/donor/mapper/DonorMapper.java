package com.ngo.finance.donor.mapper;

import com.ngo.finance.donor.dto.request.CreateDonorRequest;
import com.ngo.finance.donor.dto.response.DonorContactResponse;
import com.ngo.finance.donor.dto.response.DonorResponse;
import com.ngo.finance.donor.entity.DonorContact;
import com.ngo.finance.donor.entity.DonorMaster;
import java.util.Comparator;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

/**
 * MapStruct mapper for Donor entity to/from DTOs
 */
@Mapper(componentModel = "spring")
public interface DonorMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "city", ignore = true)
    @Mapping(target = "state", ignore = true)
    @Mapping(target = "country", ignore = true)
    @Mapping(target = "donorType", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "updatedBy", ignore = true)
    @Mapping(target = "isActive", ignore = true)
    @Mapping(target = "contacts", ignore = true)
    DonorMaster toEntity(CreateDonorRequest request);

    @Mapping(source = "city.id", target = "cityId")
    @Mapping(source = "city.cityName", target = "cityName")
    @Mapping(source = "state.id", target = "stateId")
    @Mapping(source = "state.stateName", target = "stateName")
    @Mapping(source = "country.id", target = "countryId")
    @Mapping(source = "country.countryName", target = "countryName")
    @Mapping(source = "donorType.id", target = "donorTypeId")
    @Mapping(source = "donorType.name", target = "donorTypeName")
    DonorResponse toResponse(DonorMaster entity);

    DonorContactResponse toContactResponse(DonorContact contact);

    /** Primary first, then in the order entered. */
    default List<DonorContactResponse> toContactResponses(List<DonorContact> contacts) {
        if (contacts == null) {
            return List.of();
        }
        return contacts.stream()
                .sorted(Comparator.comparing((DonorContact c) -> !Boolean.TRUE.equals(c.getIsPrimary()))
                        .thenComparing(c -> c.getSortOrder() == null ? 0 : c.getSortOrder())
                        .thenComparing(c -> c.getId() == null ? Long.MAX_VALUE : c.getId()))
                .map(this::toContactResponse)
                .toList();
    }

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "city", ignore = true)
    @Mapping(target = "state", ignore = true)
    @Mapping(target = "country", ignore = true)
    @Mapping(target = "donorType", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "updatedBy", ignore = true)
    @Mapping(target = "isActive", ignore = true)
    @Mapping(target = "donorCode", ignore = true)
    @Mapping(target = "contacts", ignore = true)
    void updateEntity(CreateDonorRequest request, @MappingTarget DonorMaster entity);
}
