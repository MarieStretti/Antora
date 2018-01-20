#!/bin/sh

# Package (aka module) release script.
# Refer to ../releasing.adoc for details about how this script works.

# resolve the version number (exact) or increment keyword (next in sequence)
if [ -z $RELEASE_VERSION ]; then
  if [ -f releaserc ]; then
    . $(pwd)/releaserc
  else
    RELEASE_VERSION=prerelease
  fi
fi

if [ -z $RELEASE_BRANCH ]; then RELEASE_BRANCH=master; fi

# don't run if this branch is behind the branch from which we're releasing
if [ "$(git merge-base --fork-point $RELEASE_BRANCH $CI_COMMIT_SHA)" != "$(git rev-parse $RELEASE_BRANCH)" ]; then
  echo $CI_COMMIT_REF_NAME is behind $RELEASE_BRANCH. This could indicate this release was already published. Aborting.
  exit 0
fi

# set up SSH auth using ssh-agent
mkdir -p -m 700 $HOME/.ssh
ssh-keygen -F gitlab.com >/dev/null 2>&1 || ssh-keyscan -H -t rsa gitlab.com >> $HOME/.ssh/known_hosts 2>/dev/null
eval $(ssh-agent -s) >/dev/null
echo -n "$RELEASE_SSH_PRIV_KEY" | ssh-add -

# clone the branch from which we're releasing and switch to it
git branch -f $RELEASE_BRANCH origin/$RELEASE_BRANCH
git clone -b $RELEASE_BRANCH --no-local . build/$CI_PROJECT_NAME
cd build/$CI_PROJECT_NAME

# configure git to push changes
git remote set-url origin "git@gitlab.com:$CI_PROJECT_PATH.git"
git config user.email "$RELEASE_GIT_EMAIL"
git config user.name "$RELEASE_GIT_NAME"

# configure npm credentials to publish packages
for package in packages/*; do echo "//registry.npmjs.org/:_authToken=$RELEASE_NPM_TOKEN" > $package/.npmrc; done

# release!
if case $RELEASE_VERSION in major|minor|patch|pre*) ;; *) false;; esac; then
  lerna publish --cd-version=$RELEASE_VERSION --exact --force-publish=* --yes
else
  lerna publish --exact --force-publish=* --repo-version=$RELEASE_VERSION --yes
fi

# nuke npm credentials
for package in packages/*; do unlink $package/.npmrc; done

# kill the ssh-agent
eval $(ssh-agent -k) >/dev/null
