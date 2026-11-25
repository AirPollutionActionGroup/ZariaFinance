package com.ngo.finance.transaction.service;

import com.ngo.finance.bankDetails.entity.BankDetail;
import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.donor.entity.DonorFundProfile;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;

/**
 * Parsing, matching and labels shared by the credit and debit note CSV imports.
 * Every parse reports a readable, column-named message into the row's errors
 * and returns null, so one row can collect all its problems at once.
 */
final class ImportSupport {

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy"));

    private ImportSupport() {
    }

    static LocalDate parseDate(String raw, List<String> errors) {
        if (blank(raw)) {
            errors.add("date is required");
            return null;
        }
        for (DateTimeFormatter f : DATE_FORMATS) {
            try {
                return LocalDate.parse(raw.trim(), f);
            } catch (DateTimeParseException ignored) {
                // try the next format
            }
        }
        errors.add("date \"" + raw.trim() + "\" isn't a date — use YYYY-MM-DD or DD-MM-YYYY");
        return null;
    }

    static ContributionType parseBook(String raw, List<String> errors) {
        if (blank(raw)) {
            errors.add("book is required (LC or FC)");
            return null;
        }
        try {
            return ContributionType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            errors.add("book \"" + raw.trim() + "\" must be LC or FC");
            return null;
        }
    }

    static BigDecimal parseAmount(String column, String raw, List<String> errors) {
        String cleaned = raw.trim().replace(",", "").replace("₹", "").replace(" ", "");
        try {
            BigDecimal value = new BigDecimal(cleaned);
            if (value.signum() <= 0) {
                errors.add(column + " must be greater than 0");
                return null;
            }
            return value;
        } catch (NumberFormatException e) {
            errors.add(column + " \"" + raw.trim() + "\" isn't a number");
            return null;
        }
    }

    /** Full account number, or its last 4 digits (must be unique); the account must be on the note's book. */
    static BankDetail matchBank(String raw, ContributionType book, List<BankDetail> accounts, List<String> errors) {
        String digits = raw.replaceAll("[^0-9A-Za-z]", "");
        List<BankDetail> matches = accounts.stream()
                .filter(b -> b.getAccountNumber() != null)
                .filter(b -> {
                    String acct = b.getAccountNumber().replaceAll("[^0-9A-Za-z]", "");
                    return acct.equalsIgnoreCase(digits) || (digits.length() == 4 && acct.endsWith(digits));
                })
                .toList();
        if (matches.isEmpty()) {
            errors.add("bank_account " + raw.trim() + " doesn't match an active bank account");
            return null;
        }
        if (matches.size() > 1) {
            errors.add("bank_account " + raw.trim() + " matches more than one account — use the full account number");
            return null;
        }
        BankDetail bank = matches.get(0);
        if (book != null && bank.getBook() != book) {
            errors.add("bank_account " + bankLabel(bank) + " is on the " + bank.getBook().getShortName() + " book, not "
                    + book.getShortName());
        }
        return bank;
    }

    /** Tally voucher columns: a type needs its number; lengths fit the columns. Returns "Receipt 245", or null. */
    static String checkTallyVoucher(String type, String no, List<String> errors) {
        if (blank(no)) {
            if (!blank(type)) {
                errors.add("tally_voucher_no is required with tally_voucher_type");
            }
            return null;
        }
        if (no.trim().length() > 100) {
            errors.add("tally_voucher_no is longer than 100 characters");
        }
        if (!blank(type) && type.trim().length() > 50) {
            errors.add("tally_voucher_type is longer than 50 characters");
        }
        return CreditNoteService.tallyLabel(type, no.trim());
    }

    static String duplicateKey(LocalDate date, BigDecimal amount, String reference) {
        return date + "|" + amount.stripTrailingZeros().toPlainString() + "|" + norm(reference);
    }

    /* Labels match what the note forms store, so imported notes read the same. */

    static String bankLabel(BankDetail b) {
        String acct = b.getAccountNumber() == null ? "" : b.getAccountNumber();
        return b.getBankName() + " — ****" + acct.substring(Math.max(0, acct.length() - 4));
    }

    static String fundLabel(DonorFundProfile f) {
        String what = !blank(f.getPurpose()) ? f.getPurpose()
                : f.getFundClass() != null ? f.getFundClass().getLabel() : "Fund profile";
        return f.getProfileCode() + " · " + what;
    }

    /** ₹1,00,000 / ₹46,882.5 — rupees with Indian grouping, as the screens show them. */
    static String inr(BigDecimal amount) {
        return "₹" + grouped(amount, true);
    }

    /** 1234567.50 → "12,34,567.5" (Indian lakh/crore grouping) or "1,234,567.5". */
    static String grouped(BigDecimal amount, boolean indian) {
        String plain = amount.setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
        boolean negative = plain.startsWith("-");
        if (negative) {
            plain = plain.substring(1);
        }
        int dot = plain.indexOf('.');
        String whole = dot < 0 ? plain : plain.substring(0, dot);
        String fraction = dot < 0 ? "" : plain.substring(dot);
        StringBuilder out = new StringBuilder();
        int len = whole.length();
        for (int i = 0; i < len; i++) {
            int fromEnd = len - i;
            out.append(whole.charAt(i));
            boolean boundary = indian
                    ? fromEnd > 1 && (fromEnd - 1 == 3 || (fromEnd - 1 > 3 && (fromEnd - 1 - 3) % 2 == 0))
                    : fromEnd > 1 && (fromEnd - 1) % 3 == 0;
            if (boundary) {
                out.append(',');
            }
        }
        return (negative ? "-" : "") + out + fraction;
    }

    static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    static String trimOrNull(String s) {
        return blank(s) ? null : s.trim();
    }

    static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }
}
