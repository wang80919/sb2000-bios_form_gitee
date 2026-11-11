; ------------------------------------------------------------------------
; 名称：dos-messages-en.asm
; 说明：DOS 出错信息（英文），顺序与出错码一一对应
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 5B-5B 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
; ---- 第 1 页（$8000 起）----
    .ascii "No error"
    .byte $00
    .ascii "Invalid funtion no."
    .byte $00
    .ascii "File not found"
    .byte $00
    .ascii "Directory not found"
    .byte $00
    .ascii "No usable descriptive word(Too\r\nmany files opened)"
    .byte $00
    .ascii "Access denied(eg.Attempt open\r\nor write a readonly file)"
    .byte $00
    .ascii "Invalid desciptive word"
    .byte $00
    .ascii "Memory control block had been\r\ncorrupt"
    .byte $00
    .ascii "No enough memory"
    .byte $00
    .ascii "Invalid memory address"
    .byte $00
    .ascii "Invalid environment"
    .byte $00
    .ascii "Invalid form"
    .byte $00
    .ascii "Invalid access code"
    .byte $00
    .ascii "Invalid data"
    .byte $00
    .ascii "Invalid diskette parameter"
    .byte $00
    .ascii "Invalid diskette identifica-\r\ntion"
    .byte $00
    .ascii "Invalid diskette operate\r\nparameter"
    .byte $00
    .ascii "Invalid FAT table"
    .byte $00
    .ascii "No usable file"
    .byte $00
    .ascii "Diskette write protect,write\r\nattempt failed"
    .byte $00
    .ascii "Invalid file read or write\r\nposition"
    .byte $00
    .ascii "Diskette not ready"
    .byte $00
    .ascii "Command not defined"
    .byte $00
    .ascii "Bad CRC"
    .byte $00
    .ascii "No diskette in drive"
    .byte $00
    .ascii "Search error"
    .byte $00
    .ascii "Invalid diskette type"
    .byte $00
    .ascii "Sector not found"
    .byte $00
    .ascii "Invalid dirctory parameter"
    .byte $00
    .ascii "Diskette write error"
    .byte $00
    .ascii "Diskette read error"
    .byte $00
    .ascii "General error"
    .byte $00
    .ascii "File already exist"
    .byte $00
    .ascii "Cannot create directory"
    .byte $00
    .ascii "Invalid diskette change"
    .byte $00
    .ascii "Invalid FCB(File control block)"
    .byte $00
    .ascii "Shared buffer overflow"
    .byte $00
    .ascii "Invalid parameter"
    .byte $00
    .ascii "Directory already exist"
    .byte $00
    .ascii "File or Directory name error"
    .byte $00
    .ascii "File open method error"
    .byte $00
    .ascii "Attempt to delete directory \r\nwhich is not empty"
    .byte $00
    .ascii "Too much directory level"
    .byte $00
    .ascii "Dikette operate error"
    .byte $00
    .ascii "No enough diskette space"
    .byte $00
    .ascii "Duplicate file name"
    .byte $00
    .ascii "File not open"
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$4F,$4B,$00,$45,$72,$72
    .byte $6F,$72,$00
    .ascii "Press any key to continue..."
    .byte $00
    .ascii "Command input error "
    .byte $00
    .ascii "Not subor format!"
    .byte $00
    .ascii "SB DOS V2.0\r\nCopyright by SUBOR,1989-1998.\r\nAll rights reser"
    .byte $76,$65,$64,$0D,$0A,$00,$41,$3A,$00
    .ascii "\n\rClears the screen\r\n\rCLS\n\r"
    .byte $00
    .ascii "Not enough memory!"
    .byte $00
    .ascii "Read file error!"
    .byte $00
    .ascii "Insert SOURCE diskette in "
    .byte $00
    .ascii "Reading from source diskette..."
    .byte $00
    .ascii "Insert TARGET diskette in "
    .byte $00
    .ascii "Writing to target diskette..."
    .byte $00
    .ascii "Copies the contents of one  \n\rfloppy disk to another.\n\r\n\rDIS"
    .ascii "KCOPY drive1: drive2:\n\r\n\rThe two floppy disks must be  \n\rthe"
    .ascii " same type.\n\r\n\r"
    .byte $00
    .ascii "SB-DOS Version 2.00"
    .byte $00
    .ascii "Displays the dos version.\n\rVER\n"
    .byte $00
    .ascii "Formats disk for use with SBDOS\r\nFORMAT drive: [/V[:label]] "
    .ascii "[/Q]\r\n/V[:label] Spedifies the volume\r\n           label.\r\n/Q"
    .ascii "         Perferms a quick\r\n           format"
    .byte $00
    .ascii "Insert new diskette for A:\r\nand press ENTER when ready...\r\n"
    .byte $00
    .ascii "Insert new diskette for B:\r\nand press ENTER when ready...\r\n"
    .byte $00
    .ascii "Formatting 1.44M\r\n"
    .byte $00
    .ascii "  0 percent completed."
    .byte $00
    .ascii "Format complete.      \r\n\r\n"
    .byte $00
    .ascii "Volume label(11 characters\r\nENTER for none)?\n\r"
    .byte $00
    .ascii "\r\n1,462,272"
    .byte $00
    .ascii " bytes total space\r\n"
    .byte $00
    .ascii " bytes in bad sector\r\n"
    .byte $00
    .ascii " bytes available space\r\n\r\n"
    .byte $00
    .ascii "  512 bytes in each unit.\r\n"
    .byte $00
    .ascii " units available on disk.\r\n"
    .byte $00,$32,$2C,$38,$35,$36,$00
    .ascii "\r\nNot ready\r\n"
    .byte $00
    .ascii "\r\nWrite protect error\r\nFormat terminated\r\n"
    .byte $00
    .ascii "Format failed\r\n"
    .byte $00
    .ascii "Parameter format not correct.\r\n"
    .byte $00
    .ascii "  --MORE--"
    .byte $00
    .ascii "Displays a text file.\r\n\r\nTYPE [drive:][path]filename\r\n"
    .byte $00
    .ascii "Please Insert the Disk "
    .byte $00
    .ascii "\r\nand press any key\r\n"
    .byte $00
    .ascii "Invalid media or Track 0 is bad\r\n"
    .byte $00
    .ascii "Displays or sets the date\r\n\rDATE [date]\r\n"
    .byte $00
    .ascii "Current date is:"
    .byte $00
    .ascii "\r\nEnter new date (mm-dd-yy):\r\n"
    .byte $00
    .ascii "\r\nInvalid date\r\n"
    .byte $00
    .ascii "\r\nInvalid date perameter\r\n"
    .byte $00
    .ascii "Displays or sets the time\r\n\rTIME [time]\r\n"
    .byte $00
    .ascii "Current time is:"
    .byte $00
    .ascii "\r\nEnter new time (hh:mm:ss):\r\n"
    .byte $00
    .ascii "\r\nInvalid time\r\n"
    .byte $00
    .ascii "\r\nInvalid time perameter\r\n"
    .byte $00
    .ascii "\r\nDisplays the name of or changes\r\nthe current directory.\r\n\r"
    .ascii "CHDIR [Drive:][Path]\r\nCHDIR [..]\r\nCD [Drive:][Path]\r\nCD [..]"
    .ascii "\r\n\r\n.. specifies that you want to\r\nchanges to the parent dir"
    .ascii "ectory\r\n"
    .byte $00
    .ascii "\r\nInvalid directory\r\n\r\n"
    .byte $00
    .ascii "\r\nCreates a directory.\r\n\r\nMKDIR [Drive:]Path\r\nMD [Drive:]Pat"
    .byte $68,$0D,$0A,$0D,$0A,$00
    .ascii "\r\nUnable to create directory\r\n\r\n"
    .byte $00
    .ascii "\r\nRemoves(deletes) a directory.\r\n\rRMDIR [Drive:]Path\r\nRD [Dr"
    .ascii "ive:]Path\r\n\r"
    .byte $00
    .ascii "\r\nInvalid path, not directory,\r\nor directory not empty\r\n\r\n"
    .byte $00
    .ascii "\r\nRenames a file\r\nRename|Ren [drive:][path]\r\n[filename1] [fi"
    .ascii "lename2]\r\n\rYou cannot specify the new \r\ndrive or path for de"
    .ascii "stination\r\n\r\n"
    .byte $00
    .ascii "\r\nCannot rename a directory\r\n\r\n"
    .byte $00
    .ascii "Abort,Retry,Fail?"
    .byte $00
    .ascii "Directory name already exists"
    .byte $00
    .ascii "File can't be copied to itself"
    .byte $00
    .ascii "\r\nDeletes one or more files\r\n\rDEL [drive:][path]filename [/P"
    .ascii "]\r\n\r\n/P  Prompts for confirmation\r\n    before deleting each "
    .ascii "file.\r\n"
    .byte $00
    .ascii "Delete(Y/N)?"
    .byte $00
    .ascii " files have been deleted \r\n"
    .byte $00
    .ascii "All files in this directory\r\nwill be deleted, sure(Y/N)?"
    .byte $00
    .ascii "\r\nNo file be deleted\r\n"
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
