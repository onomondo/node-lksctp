{
    "targets": [
        {
            "target_name": "lksctp",
            "sources": [ "src/main.c" ],
            "libraries": [
                "-lsctp"
            ],
            "cflags": [
                "-Werror",
                "-Wunused-variable"
            ],
        }
    ]
}
