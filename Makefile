# VoltJS-Bench GNU Makefile
# H. Diedrich

VOLTLEAD		 := ip-10-68-6-232.ec2.internal

VOLTROOT		 := /home/voltdb/voltdb
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

javaclient: all
	@ echo --- running Java client for a setup test --- 
	java Client
	java Client1 English # same as Client but no inserts and language parameter
	@ echo --- --- 

client: 
		@ echo --- running Node.js client ---
		node writes-forked.js -h $(VOLTLEAD) -c 10000 -f 4

clean:
	@ rm -rf voltdbroot
	@ rm -rf debugoutput
	@ rm -rf org
	@ rm -f helloworld.jar
	@ rm -f *.class
	@ rm -f *.DS_Store

# test if VoltDB is running on this machine
up:
	ps ax | grep voltb

# create a binary 'up' that tests if VoltDB is running on this machiner
binup:
	echo "ps ax | grep voltb" > up && chmod 777 up && sudo mv up /usr/local/bin


.PHONY: all
