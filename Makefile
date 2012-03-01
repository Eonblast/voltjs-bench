# VoltJS-Bench GNU Makefile
# H. Diedrich

VOLTLEAD         := 10.68.6.232

VOLTROOT         := /home/voltdb/voltdb
export CLASSPATH :=./:$(VOLTROOT)/lib/*:$(VOLTROOT)/voltdb/*

SRCDIR		  =./
OBJDIR		  =./
SOURCES		 := $(wildcard $(SRCDIR)/*.java)
MODULES		 := $(SOURCES:$(SRCDIR)/%.java=%)
OBJECTS		 := $(MODULES:%=$(OBJDIR)/%.class)

all: $(OBJECTS) catalogue
    

$(OBJDIR)/%.class: $(SRCDIR)/%.java
	@ mkdir -p $(OBJDIR) 
	javac -d $(OBJDIR) -s $(SRCDIR) $<
		
catalogue: helloworld.jar

helloworld.jar: project.xml 
	java -Djava.library.path=$(VOLTROOT)/voltdb org.voltdb.compiler.VoltCompiler project.xml helloworld.jar

server: all
	@ echo --- running server --- 
	java -Djava.library.path=$(VOLTROOT)/voltdb org.voltdb.VoltDB catalog helloworld.jar deployment deployment.xml leader $(VOLTLEAD) license /Users/hd/voltdb/voltdb/license.xml
	@ echo --- --- 

client: all
	@ echo --- running client --- 
	java Client
	java Client1 English # same as Client but no inserts and language parameter
	@ echo --- --- 

clean:
	@ rm -rf voltdbroot
	@ rm -rf debugoutput
	@ rm -rf org
	@ rm -f helloworld.jar
	@ rm -f *.class
	@ rm -f *.DS_Store

.PHONY: all
